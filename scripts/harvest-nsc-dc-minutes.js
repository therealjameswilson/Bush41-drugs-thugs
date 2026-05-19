const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "nsc-dc-minutes-harvest.json");
const cacheRoot = path.join(repoRoot, ".cache", "nsc-dc-source");

const QUERY_ROWS = 100;

const SERIES = [
  {
    naid: "312293887",
    shortName: "NSC Meeting Files",
    title: "H-Files - National Security Council (NSC) Meeting Files",
    documentType: "NSC meeting minutes",
    estimatedPages: 14
  },
  {
    naid: "312294079",
    shortName: "NSC/DC Meetings",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Files",
    documentType: "Deputies Committee meeting minutes",
    estimatedPages: 12
  },
  {
    naid: "312294094",
    shortName: "NSC/DC Follow-Up",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Follow-Up Files",
    documentType: "Deputies Committee follow-up file",
    estimatedPages: 8
  }
];

const CHAPTERS = [
  {
    chapter: { number: 1, name: "Counternarcotics" },
    terms: [
      "counternarcotics",
      "counter narcotics",
      "counter-narcotics",
      "narcotics",
      "drug",
      "drugs",
      "cocaine",
      "shipboarding",
      "standoff",
      "caribbean",
      "andean",
      "colombia",
      "peru",
      "bolivia"
    ],
    negatives: ["drug testing"]
  },
  {
    chapter: { number: 2, name: "Counterterrorism" },
    terms: [
      "counterterrorism",
      "counter terrorism",
      "counter-terrorism",
      "terrorism",
      "terrorist",
      "hostage",
      "hostages",
      "aviation security",
      "pan am",
      "lockerbie",
      "libya",
      "higgins",
      "hijacking",
      "bombing"
    ],
    negatives: []
  }
];

const SEARCH_TERMS = [...new Set(CHAPTERS.flatMap((chapter) => chapter.terms))];

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

function dateFor(record) {
  return logicalDate(record.coverageStartDate) || logicalDate(record.inclusiveStartDate) || logicalDate(record.productionDateArray?.[0]) || "1989-01-20";
}

function seriesFromRecord(record) {
  const ancestor = (record.ancestors || []).find((item) => SERIES.some((series) => series.naid === String(item.naId)));
  return SERIES.find((series) => series.naid === String(ancestor?.naId));
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function haystack(record) {
  return normalize([record.title, record.scopeAndContentNote, record.localIdentifier].join(" "));
}

function matchChapter(record) {
  const text = haystack(record);
  return CHAPTERS.map((chapter) => {
    const terms = chapter.terms.filter((term) => text.includes(normalize(term)));
    const negatives = chapter.negatives.filter((term) => text.includes(normalize(term)));
    return { chapter: chapter.chapter, terms, score: terms.length - negatives.length * 3 };
  })
    .filter((match) => match.terms.length && match.score > 0)
    .sort((a, b) => b.score - a.score || a.chapter.number - b.chapter.number)[0];
}

function isMeetingFile(record, series) {
  const title = record.title || "";
  if (record.levelOfDescription !== "fileUnit") return false;
  if (/cancelled|canceled|folder empty/i.test(title)) return false;
  if (/Philippines/i.test(title) && !/terrorism|terrorist|hostage|hijack|bomb/i.test(title)) return false;
  if (/Liberia/i.test(title)) return false;
  if (!/(NSC|NSC\/DC|Deputies Committee|DC).*(Meeting|Minutes|Follow-Up)|Meeting|Follow-Up/i.test(title)) return false;
  if (!series) return false;
  return Boolean(matchChapter(record));
}

function pdfPageCount(filePath) {
  const output = childProcess.execFileSync("pdfinfo", [filePath], { encoding: "utf8" });
  const match = output.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : 0;
}

function downloadAndCount(object, naid) {
  if (!object?.objectUrl) return { pageCount: 0, pageCountBasis: "listed only; estimated from comparable files" };
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
    // Fall through to an estimate below.
  }
  return { pageCount: 0, pageCountBasis: "PDF available; estimated because page count could not be measured" };
}

function median(values, fallback) {
  const clean = values.filter(Boolean).sort((a, b) => a - b);
  if (!clean.length) return fallback;
  return clean[Math.floor(clean.length / 2)];
}

function sourceNote(record, series, object, pageInfo) {
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog, Records of the National Security Council (George H. W. Bush Administration), ${series.title}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    `Series URL: https://catalog.archives.gov/id/${series.naid}.`,
    object ? `Digital object: ${object.objectFilename}, object ID ${object.objectId}, URL ${object.objectUrl}.` : "Digital object: none listed in Catalog; file is listed but no declassified PDF is online.",
    `Approximate pages: ${pageInfo.pageCount} (${pageInfo.pageCountBasis}).`,
    foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}.` : "",
    otherFindingAids.length ? `Other finding aid identifier: ${otherFindingAids.join(", ")}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Unknown"}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function toSiteRecord(item) {
  const { record, series, pageInfo } = item;
  const object = digitalObject(record);
  const match = matchChapter(record);
  const date = dateFor(record);
  const restricted = record.accessRestriction?.status || "";
  const listedStatus = object ? "Listed; PDF available, access may include withdrawals" : "Listed; no online declassified PDF";
  return {
    id: `nsc-dc-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: series.documentType,
    chapter: match.chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: record.title || "",
    topicTerms: { [match.chapter.name]: match.terms },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: pageInfo.pageCount,
    pageCountBasis: pageInfo.pageCountBasis,
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: listedStatus,
    accessRestrictionStatus: restricted,
    scoutCategory: object ? "listed-restricted-pdf" : "listed-not-declassified",
    source: {
      naid: series.naid,
      title: series.title,
      shortName: series.shortName,
      url: `https://catalog.archives.gov/id/${series.naid}`
    },
    sourceNote: sourceNote(record, series, object, pageInfo),
    matchedQueries: item.matchedQueries
  };
}

async function searchCatalog(series, term, from = 0) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", series.naid);
  url.searchParams.set("q", term);
  url.searchParams.set("rows", String(QUERY_ROWS));
  url.searchParams.set("from", String(from));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status}: ${url}`);
  return response.json();
}

async function harvestCatalog() {
  const byNaid = new Map();
  const searchLog = [];

  for (const series of SERIES) {
    for (const term of SEARCH_TERMS) {
      let returned = 0;
      let total = 0;
      for (let from = 0; ; from += QUERY_ROWS) {
        const json = await searchCatalog(series, term, from);
        const hits = json.body?.hits?.hits || [];
        total = json.body?.hits?.total?.value ?? hits.length;
        returned += hits.length;
        for (const hit of hits) {
          const record = hit._source?.record;
          const hitSeries = record ? seriesFromRecord(record) : null;
          if (!record || !hitSeries || hitSeries.naid !== series.naid) continue;
          if (!isMeetingFile(record, hitSeries)) continue;
          const key = String(record.naId);
          const existing = byNaid.get(key);
          if (existing) {
            existing.matchedQueries.push(`${series.shortName}: ${term}`);
          } else {
            byNaid.set(key, { record, series: hitSeries, matchedQueries: [`${series.shortName}: ${term}`] });
          }
        }
        if (!hits.length || from + QUERY_ROWS >= total) break;
      }
      searchLog.push({ series: series.shortName, term, total, returned });
    }
  }

  return { items: [...byNaid.values()], searchLog };
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const { items, searchLog } = await harvestCatalog();

  const measuredBySeries = new Map();
  for (const item of items) {
    item.pageInfo = downloadAndCount(digitalObject(item.record), item.record.naId);
    if (item.pageInfo.pageCount) {
      const values = measuredBySeries.get(item.series.naid) || [];
      values.push(item.pageInfo.pageCount);
      measuredBySeries.set(item.series.naid, values);
    }
  }

  for (const item of items) {
    if (item.pageInfo.pageCount) continue;
    item.pageInfo = {
      pageCount: median(measuredBySeries.get(item.series.naid) || [], item.series.estimatedPages),
      pageCountBasis: `estimated from ${item.series.shortName} comparable files`
    };
  }

  const reviewedAdditions = items.map(toSiteRecord);
  const excludedAfterPageReview = reviewedAdditions
    .filter((record) => record.pageCount <= 2)
    .map((record) => ({
      naid: record.naid,
      title: record.title,
      date: record.date,
      pageCount: record.pageCount,
      pageCountBasis: record.pageCountBasis,
      reason: "Excluded from primary chronology because the available file is a one- or two-page locator/placeholder rather than substantive minutes."
    }));
  const additions = reviewedAdditions.filter((record) => record.pageCount > 2);
  const additionNaids = new Set(additions.map((record) => record.naid));
  const base = existing.filter((record) => !record.id?.startsWith("nsc-dc-") && !additionNaids.has(record.naid));
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
        sourceSeries: SERIES.map((series) => ({ ...series, catalogUrl: `https://catalog.archives.gov/id/${series.naid}` })),
        searchTerms: SEARCH_TERMS,
        searchLog,
        selectedRecords: additions.length,
        reviewedRecords: reviewedAdditions.length,
        measuredRecords: additions.filter((record) => record.pageCountBasis === "measured from available PDF").length,
        estimatedRecords: additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length,
        listedNoOnlinePdfRecords: additions.filter((record) => !record.pdfUrl).length,
        chapterCounts: Object.fromEntries(CHAPTERS.map((chapter) => [chapter.chapter.name, additions.filter((record) => record.chapter.name === chapter.chapter.name).length])),
        excludedAfterPageReview,
        records: additions
      },
      null,
      2
    )}\n`
  );

  console.log(`Integrated ${additions.length} NSC/DC listed minutes and follow-up files.`);
  console.log(`Measured pages: ${additions.filter((record) => record.pageCountBasis === "measured from available PDF").length}`);
  console.log(`Estimated pages: ${additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
