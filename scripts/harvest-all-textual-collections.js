const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "all-textual-collections-harvest.json");
const cacheRoot = path.join(repoRoot, ".cache", "all-textual-collections");

const COLLECTIONS_URL =
  "https://www.bush41library.gov/digital-research-room/about-textual-collections/all-textual-collections";
const QUERY_ROWS = 100;
const MAX_PAGES_PER_TERM = 3;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15000;

const TOPIC_QUERIES = [
  "National Drug Control Strategy",
  "Office of National Drug Control Policy",
  "Drug Czar",
  "Drug Control",
  "Drug Policy",
  "Drug Information",
  "Narcotics",
  "Counternarcotics",
  "Counterterrorism",
  "Terrorism",
  "Terrorist",
  "Pan Am 103",
  "Lockerbie",
  "Hostage",
  "Hostages",
  "Kidnapping",
  "Hijacking",
  "Aviation Security",
  "Drug Summit",
  "San Antonio Narcotics Summit",
  "Andean",
  "Cocaine"
];

const ALREADY_SPECIALIZED_COLLECTIONS = new Set([
  "564645",
  "580456"
]);

const CHAPTERS = {
  Counternarcotics: { number: 1, name: "Counternarcotics" },
  Counterterrorism: { number: 2, name: "Counterterrorism" }
};

const COUNTERNARCOTICS_TITLE_RE =
  /\b(national drug control strategy|office of national drug control policy|drug czar|drug control|drug policy|drug information|narcotics|counternarcotics|counter[- ]?narcotics|drug summit|san antonio narcotics summit|cocaine|andean drug|drug interdiction|drug certification)\b/i;

const COUNTERTERRORISM_TITLE_RE =
  /\b(counterterrorism|counter[- ]?terrorism|terrorism|terrorist|pan am 103|lockerbie|hostage|hostages|kidnapping|hijacking|aviation security|terrorist bombing|terrorist incident)\b/i;

const LOW_VALUE_TITLE_RE =
  /\b(photograph|photo|videotape|audiotape|artifact|gift|visitor|invitation|greeting|holiday card|birthday|autograph|personnel file|resume|recommendation|scheduling proposal|appointment request|tour request|school|eagle scout)\b/i;

const NON_VOLUME_COLLECTION_RE =
  /\b(Reagan Administration|Ronald Reagan|1988 Campaign|David Hoffman|Barbara Pierce Bush's Office in the Office of the Vice President)\b/i;

const LOW_VALUE_COLLECTION_RE =
  /\b(Press Secretary|Speechwriting|Communications|Media Affairs|Public Liaison|Public Affairs|Presidential Personnel|Correspondence|Management and Administration|National Service|Political Affairs|Intergovernmental Affairs|Legislative Affairs|Executive Clerk|First Lady's Office|Office of Administration of the Vice President|Staff Secretary of the Vice President)\b/i;

const ANCHOR_TITLE_RE =
  /\b(Pan Am 103|Lockerbie|President's Commission on Aviation Security and Terrorism|National Drug Control Strategy|Domestic Policy Council Meeting|Drug Policy Strategy|Drug Control Policy|NSD-|NSR-|NSC\/DC|Deputies Committee|DC \[Deputies Committee\]|Drug Summit|San Antonio Narcotics Summit)\b/i;

const POLICY_DOCUMENT_RE =
  /\b(meeting|minutes|memorandum|memo|briefing|briefing book|report|commission|strategy|directive|review|summit|agenda|issues for consideration|decision|paper)\b/i;

const LOW_VALUE_SERIES_OR_TITLE_RE =
  /\b(Press Release|Speech|Speeches|Speechwriter|Speechwriting|Pardon|Appointment Files|Publication|Office of Independent Counsel|OIC|Personnel Files|Christmas Card|Travel Office|Medals|Toast|PRS|Presidential Records System|Family|Families|Victim|In Remembrance|Iran Contra|NNBIS)\b/i;

function decodeEntities(value) {
  return (value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeEntities((value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function logicalDate(date) {
  return date?.logicalDate || "";
}

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};

function titleDate(record) {
  const title = record.title || "";
  const longDate = title.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(19\d{2}|20\d{2})\b/i
  );
  if (longDate) {
    return `${longDate[3]}-${MONTHS[longDate[1].toLowerCase()]}-${String(longDate[2]).padStart(2, "0")}`;
  }

  const bracketYear = title.match(/\[(19\d{2}|20\d{2})\]/);
  if (bracketYear) return `${bracketYear[1]}-01-01`;

  const looseYear = title.match(/\b(1989|1990|1991|1992)\b/);
  if (looseYear) return `${looseYear[1]}-01-01`;

  return "";
}

function dateFor(record) {
  return (
    logicalDate(record.coverageStartDate) ||
    logicalDate(record.inclusiveStartDate) ||
    logicalDate(record.productionDateArray?.[0]) ||
    titleDate(record) ||
    "1989-01-20"
  );
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
}

function seriesFromRecord(record) {
  return (record.ancestors || []).find((item) => item.levelOfDescription === "series") || null;
}

function collectionFromRecord(record) {
  return (record.ancestors || []).find((item) => item.levelOfDescription === "collection") || null;
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function extent(record) {
  return record.physicalOccurrences?.map((item) => item.extent).filter(Boolean).join("; ") || "";
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function pdfPageCount(filePath) {
  const output = childProcess.execFileSync("pdfinfo", [filePath], { encoding: "utf8" });
  const match = output.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : 0;
}

function downloadAndCount(object, naid) {
  if (!object?.objectUrl) {
    return {
      pageCount: 25,
      pageCountBasis: "estimated from listed textual file; no online declassified PDF listed"
    };
  }

  fs.mkdirSync(cacheRoot, { recursive: true });
  const filename = `${naid}-${object.objectFilename || "source.pdf"}`.replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const target = path.join(cacheRoot, filename);
  if (!fs.existsSync(target)) {
    childProcess.execFileSync("curl", ["-L", object.objectUrl, "-o", target], { stdio: "ignore" });
  }

  try {
    const count = pdfPageCount(target);
    if (count) return { pageCount: count, pageCountBasis: "measured from available PDF" };
  } catch {
    // Fall through to a file-unit estimate.
  }

  return {
    pageCount: 25,
    pageCountBasis: "estimated from listed textual file; PDF page count unavailable"
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
      return response.json();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function parseCollections(html) {
  const collections = [];
  const rowRe =
    /<tr>\s*<td class="colnum-0">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/td>\s*<td class="colnum-1">([\s\S]*?)<\/td>\s*<td class="colnum-2">([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;
  while ((match = rowRe.exec(html))) {
    const url = decodeEntities(match[1]);
    const title = stripTags(match[2]);
    const collectionType = stripTags(match[3]);
    const naid = stripTags(match[4]).match(/\d+/)?.[0] || "";
    if (!naid) continue;
    collections.push({
      naid,
      title,
      collectionType,
      url: url.startsWith("http") ? url : `https://www.bush41library.gov${url}`
    });
  }
  return collections;
}

async function searchCatalog(collection, query, from = 0) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", collection.naid);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", String(QUERY_ROWS));
  url.searchParams.set("from", String(from));
  const json = await fetchJson(url);
  const hits = json.body?.hits?.hits || [];
  const total = json.body?.hits?.total?.value ?? hits.length;
  return { hits, total, url: String(url) };
}

function classifySelection(record) {
  const title = record.title || "";
  if (LOW_VALUE_TITLE_RE.test(title) && !/pan am 103|national drug control|drug summit|terrorism|hostage/i.test(title)) {
    return { selected: false, reason: "Low-value administrative, photo, visitor, gift, personnel, or scheduling title." };
  }

  const counterterrorism = COUNTERTERRORISM_TITLE_RE.test(title);
  const counternarcotics = COUNTERNARCOTICS_TITLE_RE.test(title);

  if (!counterterrorism && !counternarcotics) {
    return { selected: false, reason: "Topic term appears in search hit, but not as a direct FRUS-grade title signal." };
  }

  if (counterterrorism && !counternarcotics) {
    return {
      selected: true,
      chapterName: "Counterterrorism",
      documentType: /pan am 103|lockerbie/i.test(title)
        ? "All textual collections Pan Am 103 file"
        : /aviation security/i.test(title)
          ? "All textual collections aviation security file"
          : "All textual collections counterterrorism file",
      topicTerms: topicTerms("Counterterrorism", title)
    };
  }

  return {
    selected: true,
    chapterName: "Counternarcotics",
    documentType: /drug summit|san antonio narcotics summit/i.test(title)
      ? "All textual collections drug summit file"
      : /national drug control strategy|office of national drug control policy|drug czar|drug policy|drug control/i.test(title)
        ? "All textual collections drug policy file"
        : "All textual collections counternarcotics file",
    topicTerms: topicTerms("Counternarcotics", title)
  };
}

function priorityReason(record, selection) {
  if (!selection.selected) return selection.reason;

  const title = record.title || "";
  const series = seriesFromRecord(record);
  const collection = collectionFromRecord(record);
  const collectionTitle = collection?.title || "";
  const seriesTitle = series?.title || "";
  const sourceText = `${collectionTitle} ${seriesTitle}`;

  if (NON_VOLUME_COLLECTION_RE.test(sourceText)) {
    return "Excluded from the chronology because the source collection is pre-presidential/Reagan-era or campaign material, not a Bush 1989-1992 presidential record.";
  }

  if (LOW_VALUE_COLLECTION_RE.test(sourceText)) {
    return "Excluded from the chronology because this is a public-facing, personnel, correspondence, scheduling, or administrative office file rather than a policy source file.";
  }

  if (LOW_VALUE_SERIES_OR_TITLE_RE.test(`${sourceText} ${title}`) && !/President's Commission on Aviation Security and Terrorism/i.test(title)) {
    return "Excluded from the chronology because the series or title is a press, speech, publication, pardon, appointment, personnel, travel, or investigative-administration file.";
  }

  if (/National Security Council|National Security Affairs Office in the Office of the Vice President|Richard Cheney Collection|President's Foreign Intelligence Advisory Board/i.test(sourceText)) {
    if (POLICY_DOCUMENT_RE.test(title) || /\b(counternarcotics|counter[- ]?narcotics|counterterrorism|counter[- ]?terrorism|terrorism|hostage|hijacking|aviation security|pan am 103|lockerbie)\b/i.test(title)) {
      return "";
    }
  }

  if (/Domestic Policy Council|Council of Economic Advisors|Office of Domestic Policy and the Council on Competitiveness|Office of Policy Development|Cabinet Affairs/i.test(sourceText)) {
    if (/\b(National Drug Control Strategy|Domestic Policy Council Meeting|Drug Policy Strategy|Drug Control Policy|Drug Strategy|Office of National Drug Control Policy)\b/i.test(title)) {
      return "";
    }
  }

  if (/Office of Counsel/i.test(sourceText)) {
    if (/\b(Pan Am 103|Lockerbie|Aviation Security|Terrorism|Terrorist|Hostage|Hijacking|Extradition|Narcotics|Drug Control|Drug Policy)\b/i.test(title)) {
      return "";
    }
  }

  if (/Staff Secretary|Cabinet Affairs/i.test(sourceText) && ANCHOR_TITLE_RE.test(title)) {
    return "";
  }

  if (ANCHOR_TITLE_RE.test(title) && POLICY_DOCUMENT_RE.test(title)) {
    return "";
  }

  return "Held in the all-textual audit but not promoted because it lacks a strong FRUS documentary form or high-policy source context.";
}

function topicTerms(chapterName, title) {
  const text = normalize(title);
  if (chapterName === "Counternarcotics") {
    return [
      text.includes("national drug control") ? "national drug control strategy" : "",
      text.includes("drug summit") || text.includes("san antonio") ? "drug summit" : "",
      text.includes("narcotics") ? "narcotics" : "",
      text.includes("drug") ? "drug policy" : "",
      text.includes("cocaine") ? "cocaine" : "",
      text.includes("andean") ? "Andean strategy" : ""
    ].filter(Boolean);
  }

  return [
    text.includes("pan am") || text.includes("lockerbie") ? "Pan Am 103" : "",
    text.includes("aviation security") ? "aviation security" : "",
    text.includes("hostage") ? "hostages" : "",
    text.includes("hijacking") ? "hijacking" : "",
    text.includes("terror") ? "terrorism" : ""
  ].filter(Boolean);
}

function sourceNote(record, object, pageInfo) {
  const series = seriesFromRecord(record);
  const collection = collectionFromRecord(record);
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog, ${collection?.title || "George H. W. Bush Presidential Library textual collection"}, ${series?.title || "series pending"}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    series?.naId ? `Series URL: https://catalog.archives.gov/id/${series.naId}.` : "",
    collection?.naId ? `Collection URL: https://catalog.archives.gov/id/${collection.naId}.` : "",
    object ? `Digital object: ${object.objectFilename}, object ID ${object.objectId}, URL ${object.objectUrl}.` : "Digital object: none listed in Catalog; file is listed but no declassified PDF is online.",
    `Approximate pages: ${pageInfo.pageCount} (${pageInfo.pageCountBasis}).`,
    foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}.` : "",
    otherFindingAids.length ? `Other finding aid identifier: ${otherFindingAids.join(", ")}.` : "",
    extent(record) ? `Extent: ${extent(record)}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Unknown"}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function toSiteRecord(item) {
  const { record, selection, matchedQueries, pageInfo } = item;
  const object = digitalObject(record);
  const series = seriesFromRecord(record);
  const collection = collectionFromRecord(record);
  const chapter = CHAPTERS[selection.chapterName];
  const date = dateFor(record);

  return {
    id: `all-textual-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: selection.documentType,
    chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: series?.title || collection?.title || "",
    topicTerms: { [chapter.name]: selection.topicTerms },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: pageInfo.pageCount,
    pageCountBasis: pageInfo.pageCountBasis,
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: object ? "Textual collection listed file; PDF available, access may include withdrawals" : "Textual collection listed file; no online declassified PDF",
    accessRestrictionStatus: record.accessRestriction?.status || "",
    scoutCategory: object ? "all-textual-listed-pdf" : "all-textual-listed-not-online",
    source: {
      naid: String(series?.naId || collection?.naId || ""),
      title: series?.title || collection?.title || "Bush Library textual collection",
      shortName: series?.title || collection?.title || "Bush Library textual collection",
      url: series?.naId ? `https://catalog.archives.gov/id/${series.naId}` : collection?.naId ? `https://catalog.archives.gov/id/${collection.naId}` : ""
    },
    sourceNote: sourceNote(record, object, pageInfo),
    matchedQueries
  };
}

async function mapLimit(values, limit, worker) {
  const queue = [...values];
  const results = [];
  await Promise.all(
    Array(Math.min(limit, queue.length))
      .fill(0)
      .map(async () => {
        while (queue.length) {
          const value = queue.shift();
          results.push(await worker(value));
        }
      })
  );
  return results;
}

async function searchCollection(collection) {
  const records = new Map();
  const searchLog = [];

  for (const query of TOPIC_QUERIES) {
    let total = 0;
    let returned = 0;
    let truncated = false;
    let error = "";
    for (let page = 0; page < MAX_PAGES_PER_TERM; page += 1) {
      const from = page * QUERY_ROWS;
      let searchResult;
      try {
        searchResult = await searchCatalog(collection, query, from);
      } catch (searchError) {
        error = searchError.message;
        break;
      }
      const { hits, total: hitTotal } = searchResult;
      total = hitTotal;
      returned += hits.length;
      for (const hit of hits) {
        const record = hit._source?.record;
        if (!record || record.levelOfDescription !== "fileUnit") continue;
        const key = String(record.naId);
        const existing = records.get(key) || { record, matchedQueries: [] };
        if (!existing.matchedQueries.includes(query)) existing.matchedQueries.push(query);
        records.set(key, existing);
      }
      if (!hits.length || from + QUERY_ROWS >= total) break;
      if (page === MAX_PAGES_PER_TERM - 1) truncated = true;
    }
    searchLog.push({ collectionNaid: collection.naid, query, total, returned, truncated, error });
  }

  return {
    collection,
    searchLog,
    records: [...records.values()]
  };
}

async function main() {
  const html = await fetchText(COLLECTIONS_URL);
  const collections = parseCollections(html);
  const existing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const existingWithoutAllTextual = existing.filter((record) => !record.id?.startsWith("all-textual-"));
  const existingNaids = new Set(existingWithoutAllTextual.map((record) => String(record.naid)));

  const results = await mapLimit(collections, CONCURRENCY, searchCollection);
  const broadRecords = new Map();

  for (const result of results) {
    for (const item of result.records) {
      const key = String(item.record.naId);
      const existingItem = broadRecords.get(key);
      if (existingItem) {
        for (const query of item.matchedQueries) {
          if (!existingItem.matchedQueries.includes(query)) existingItem.matchedQueries.push(query);
        }
      } else {
        broadRecords.set(key, { ...item, collectionPage: result.collection });
      }
    }
  }

  const reviewed = [...broadRecords.values()].map((item) => {
    const selection = classifySelection(item.record);
    const series = seriesFromRecord(item.record);
    const collection = collectionFromRecord(item.record);
    return {
      naid: String(item.record.naId),
      title: item.record.title || "",
      seriesNaid: String(series?.naId || ""),
      seriesTitle: series?.title || "",
      collectionNaid: String(collection?.naId || item.collectionPage.naid),
      collectionTitle: collection?.title || item.collectionPage.title,
      catalogUrl: `https://catalog.archives.gov/id/${item.record.naId}`,
      online: Boolean(digitalObject(item.record)),
      localIdentifier: item.record.localIdentifier || "",
      containerId: containerId(item.record),
      matchedQueries: item.matchedQueries,
      selected: selection.selected,
      prioritySelected: selection.selected && !priorityReason(item.record, selection),
      alreadySpecializedCollection: ALREADY_SPECIALIZED_COLLECTIONS.has(String(collection?.naId || item.collectionPage.naid)),
      alreadyInChronology: existingNaids.has(String(item.record.naId)),
      reason: selection.selected ? priorityReason(item.record, selection) || "Direct-title policy/source match." : selection.reason
    };
  });

  const candidates = [...broadRecords.values()]
    .map((item) => ({ ...item, selection: classifySelection(item.record) }))
    .filter((item) => item.selection.selected)
    .filter((item) => !priorityReason(item.record, item.selection))
    .filter((item) => !existingNaids.has(String(item.record.naId)));

  for (const item of candidates) {
    item.pageInfo = downloadAndCount(digitalObject(item.record), item.record.naId);
  }

  const reviewedAdditions = candidates.map(toSiteRecord);
  const excludedAfterPageReview = reviewedAdditions
    .filter((record) => record.pdfUrl && record.pageCount <= 2)
    .map((record) => ({
      naid: record.naid,
      title: record.title,
      source: record.source.shortName,
      pageCount: record.pageCount,
      pageCountBasis: record.pageCountBasis,
      reason: "Excluded from primary chronology because the available PDF is a one- or two-page locator/placeholder rather than a substantive textual file."
    }));

  const additions = reviewedAdditions.filter((record) => !record.pdfUrl || record.pageCount > 2);
  const additionNaids = new Set(additions.map((record) => record.naid));
  const base = existingWithoutAllTextual.filter((record) => !additionNaids.has(String(record.naid)));
  const records = [...base, ...additions].sort(
    (a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title)
  );
  const json = JSON.stringify(records, null, 2);

  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourcePage: COLLECTIONS_URL,
        collectionCount: collections.length,
        topicQueries: TOPIC_QUERIES,
        queryRows: QUERY_ROWS,
        maxPagesPerTerm: MAX_PAGES_PER_TERM,
        collections,
        searchLog: results.flatMap((result) => result.searchLog),
        reviewedRecords: reviewed.length,
        selectedDirectTitleRecords: reviewed.filter((record) => record.selected).length,
        prioritySelectedRecords: reviewed.filter((record) => record.prioritySelected).length,
        alreadyInChronology: reviewed.filter((record) => record.selected && record.alreadyInChronology).length,
        selectedRecordsAdded: additions.length,
        measuredRecords: additions.filter((record) => record.pageCountBasis === "measured from available PDF").length,
        estimatedRecords: additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length,
        chapterCounts: {
          Counternarcotics: additions.filter((record) => record.chapter.name === "Counternarcotics").length,
          Counterterrorism: additions.filter((record) => record.chapter.name === "Counterterrorism").length
        },
        excludedAfterPageReview,
        reviewed,
        records: additions
      },
      null,
      2
    )}\n`
  );

  console.log(`Parsed ${collections.length} Bush Library textual collections.`);
  console.log(`Reviewed ${reviewed.length} unique topic hits.`);
  console.log(`Direct-title selected records: ${reviewed.filter((record) => record.selected).length}`);
  console.log(`Already in chronology: ${reviewed.filter((record) => record.selected && record.alreadyInChronology).length}`);
  console.log(`Integrated ${additions.length} all-textual collection files.`);
  console.log(additions.reduce((counts, record) => {
    counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
    return counts;
  }, {}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
