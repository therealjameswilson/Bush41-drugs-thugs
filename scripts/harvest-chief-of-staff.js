const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "chief-of-staff-harvest.json");
const cacheRoot = path.join(repoRoot, ".cache", "chief-of-staff-source");

const COLLECTION_NAID = "580456";
const QUERY_ROWS = 100;

const TARGETS = new Map([
  ["702362", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-09-01" }],
  ["702363", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-09-01" }],
  ["702364", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-09-01" }],
  ["472802379", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-01-20" }],
  ["472802380", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-01-20" }],
  ["472802381", { chapter: "Counternarcotics", documentType: "Chief of Staff policy file", date: "1989-01-20" }],
  ["702683", { chapter: "Counternarcotics", documentType: "Chief of Staff Cabinet file", date: "1989-01-20" }],
  ["702684", { chapter: "Counternarcotics", documentType: "Chief of Staff Cabinet file", date: "1990-01-01" }],
  ["702720", { chapter: "Counternarcotics", documentType: "Chief of Staff Cabinet file", date: "1991-01-01" }],
  ["563877964", { chapter: "Counternarcotics", documentType: "Chief of Staff subject file", date: "1989-01-20" }],
  ["563877965", { chapter: "Counternarcotics", documentType: "Chief of Staff subject file", date: "1989-01-20" }],
  ["472802366", { chapter: "Counterterrorism", documentType: "Chief of Staff Pan Am 103 file", date: "1989-09-01" }],
  ["702471", { chapter: "Counterterrorism", documentType: "Chief of Staff Pan Am 103 file", date: "1989-09-01" }]
]);

const TARGET_QUERIES = [
  "National Drug Control Strategy",
  "Drugs Issue",
  "Bennett Drug Policy",
  "Bennett Drug Control",
  "Martinez Drug Policy",
  "Drug Information",
  "Pan Am 103 Commission"
];

const BROAD_TERMS = [
  "narcotics",
  "drug",
  "drugs",
  "cocaine",
  "colombia",
  "peru",
  "bolivia",
  "drug summit",
  "san antonio",
  "terrorism",
  "terrorist",
  "hostage",
  "hostages",
  "kidnapping",
  "pan am",
  "lockerbie",
  "hijacking",
  "aviation security",
  "libya",
  "extradition",
  "thornburgh",
  "skinner"
];

const CHAPTERS = {
  Counternarcotics: { number: 1, name: "Counternarcotics" },
  Counterterrorism: { number: 2, name: "Counterterrorism" }
};

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

function dateFor(record, target) {
  return logicalDate(record.coverageStartDate) || logicalDate(record.inclusiveStartDate) || target.date;
}

function seriesFromRecord(record) {
  return (record.ancestors || []).find((item) => item.levelOfDescription === "series") || null;
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
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
  if (!object?.objectUrl) return { pageCount: 25, pageCountBasis: "estimated from one legal file folder; no online declassified PDF listed" };
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
    // Fall through to a folder estimate.
  }
  return { pageCount: 25, pageCountBasis: "estimated from one legal file folder; PDF page count unavailable" };
}

function topicTerms(target) {
  if (target.chapter === "Counternarcotics") return ["drug policy", "narcotics"];
  return ["pan am", "lockerbie", "aviation security"];
}

function sourceNote(record, series, object, pageInfo) {
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog, Records of the White House Office of the Chief of Staff to the President (George H. W. Bush Administration), ${series?.title || "series pending"}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    series?.naId ? `Series URL: https://catalog.archives.gov/id/${series.naId}.` : "",
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
  const { record, target, pageInfo, matchedQueries } = item;
  const object = digitalObject(record);
  const series = seriesFromRecord(record);
  const chapter = CHAPTERS[target.chapter];
  const date = dateFor(record, target);
  return {
    id: `chief-of-staff-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: target.documentType,
    chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: series?.title || "",
    topicTerms: { [chapter.name]: topicTerms(target) },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: pageInfo.pageCount,
    pageCountBasis: pageInfo.pageCountBasis,
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: object ? "Chief of Staff listed file; PDF available, access may include withdrawals" : "Chief of Staff listed file; no online declassified PDF",
    accessRestrictionStatus: record.accessRestriction?.status || "",
    scoutCategory: object ? "chief-of-staff-listed-pdf" : "chief-of-staff-listed-not-online",
    source: {
      naid: String(series?.naId || COLLECTION_NAID),
      title: series?.title || "Records of the White House Office of the Chief of Staff to the President",
      shortName: series?.title ? `COS: ${series.title}` : "Chief of Staff",
      url: `https://catalog.archives.gov/id/${series?.naId || COLLECTION_NAID}`
    },
    sourceNote: sourceNote(record, series, object, pageInfo),
    matchedQueries
  };
}

async function searchCatalog(query, from = 0) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", COLLECTION_NAID);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", String(QUERY_ROWS));
  url.searchParams.set("from", String(from));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status}: ${url}`);
  return response.json();
}

async function collectTargetRecords() {
  const byNaid = new Map();
  const searchLog = [];
  for (const query of TARGET_QUERIES) {
    let total = 0;
    let returned = 0;
    for (let from = 0; ; from += QUERY_ROWS) {
      const json = await searchCatalog(query, from);
      const hits = json.body?.hits?.hits || [];
      total = json.body?.hits?.total?.value ?? hits.length;
      returned += hits.length;
      for (const hit of hits) {
        const record = hit._source?.record;
        if (!record || record.levelOfDescription !== "fileUnit") continue;
        const target = TARGETS.get(String(record.naId));
        if (!target) continue;
        const existing = byNaid.get(String(record.naId));
        if (existing) {
          existing.matchedQueries.push(query);
        } else {
          byNaid.set(String(record.naId), { record, target, matchedQueries: [query] });
        }
      }
      if (!hits.length || from + QUERY_ROWS >= total) break;
    }
    searchLog.push({ query, total, returned });
  }
  return { items: [...byNaid.values()], searchLog };
}

async function broadAudit() {
  const byNaid = new Map();
  const searchLog = [];
  for (const term of BROAD_TERMS) {
    let total = 0;
    let returned = 0;
    for (let from = 0; ; from += QUERY_ROWS) {
      const json = await searchCatalog(term, from);
      const hits = json.body?.hits?.hits || [];
      total = json.body?.hits?.total?.value ?? hits.length;
      returned += hits.length;
      for (const hit of hits) {
        const record = hit._source?.record;
        if (!record || record.levelOfDescription !== "fileUnit") continue;
        const series = seriesFromRecord(record);
        const key = String(record.naId);
        const existing = byNaid.get(key) || {
          naid: key,
          title: record.title || "",
          seriesNaid: String(series?.naId || ""),
          seriesTitle: series?.title || "",
          localIdentifier: record.localIdentifier || "",
          containerId: containerId(record),
          catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
          online: Boolean(digitalObject(record)),
          selected: TARGETS.has(key),
          matchedTerms: []
        };
        if (!existing.matchedTerms.includes(term)) existing.matchedTerms.push(term);
        byNaid.set(key, existing);
      }
      if (!hits.length || from + QUERY_ROWS >= total) break;
    }
    searchLog.push({ term, total, returned });
  }
  const records = [...byNaid.values()].sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle) || a.title.localeCompare(b.title));
  const seriesCounts = {};
  for (const record of records) {
    const key = `${record.seriesNaid}: ${record.seriesTitle}`;
    seriesCounts[key] = (seriesCounts[key] || 0) + 1;
  }
  return { reviewedRecords: records.length, searchLog, seriesCounts, records };
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const [{ items, searchLog }, audit] = await Promise.all([collectTargetRecords(), broadAudit()]);

  for (const item of items) {
    item.pageInfo = downloadAndCount(digitalObject(item.record), item.record.naId);
  }

  const reviewedAdditions = items.map(toSiteRecord);
  const excludedAfterPageReview = reviewedAdditions
    .filter((record) => record.pdfUrl && record.pageCount <= 2)
    .map((record) => ({
      naid: record.naid,
      title: record.title,
      source: record.source.shortName,
      pageCount: record.pageCount,
      pageCountBasis: record.pageCountBasis,
      reason: "Excluded from primary chronology because the available PDF is a one- or two-page locator/placeholder rather than a substantive Chief of Staff file."
    }));
  const additions = reviewedAdditions.filter((record) => !record.pdfUrl || record.pageCount > 2);
  const additionNaids = new Set(additions.map((record) => record.naid));
  const base = existing.filter((record) => !record.id?.startsWith("chief-of-staff-") && !additionNaids.has(record.naid));
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
        collection: {
          naid: COLLECTION_NAID,
          title: "Records of the White House Office of the Chief of Staff to the President (George H. W. Bush Administration)",
          catalogUrl: `https://catalog.archives.gov/id/${COLLECTION_NAID}`
        },
        targetNaids: [...TARGETS.keys()],
        targetQueries: TARGET_QUERIES,
        searchLog,
        broadAudit: audit,
        selectedRecords: additions.length,
        reviewedTargetRecords: reviewedAdditions.length,
        measuredRecords: additions.filter((record) => record.pageCountBasis === "measured from available PDF").length,
        estimatedRecords: additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length,
        chapterCounts: {
          Counternarcotics: additions.filter((record) => record.chapter.name === "Counternarcotics").length,
          Counterterrorism: additions.filter((record) => record.chapter.name === "Counterterrorism").length
        },
        excludedAfterPageReview,
        records: additions
      },
      null,
      2
    )}\n`
  );

  console.log(`Integrated ${additions.length} Chief of Staff files.`);
  console.log(`Measured pages: ${additions.filter((record) => record.pageCountBasis === "measured from available PDF").length}`);
  console.log(`Excluded as locator/placeholder PDFs: ${excludedAfterPageReview.length}`);
  console.log(additions.reduce((counts, record) => {
    counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
    return counts;
  }, {}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
