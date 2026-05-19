const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "whorm-harvest.json");
const cacheRoot = path.join(repoRoot, ".cache", "whorm-source");

const QUERY_ROWS = 100;
const WHORM_NAID = "564645";

const SOURCE_SERIES = [
  {
    naid: "498171302",
    shortName: "WHORM Drug Summit Colombia",
    title: "Subject Files on Drug Summit in Colombia",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "WHORM anchoring event file",
    defaultDate: "1990-02-15",
    query: "Case",
    estimatedPages: 25
  },
  {
    naid: "498171306",
    shortName: "WHORM Drug Summit San Antonio",
    title: "Subject Files on Drug Summit in San Antonio, Texas",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "WHORM anchoring event file",
    defaultDate: "1992-02-26",
    query: "Case",
    estimatedPages: 25,
    keepOnly: ["597640551"]
  },
  {
    naid: "498170960",
    shortName: "WHORM ONDCP",
    title: "Subject Files on Office of National Drug Control Policy",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "WHORM policy subject file",
    defaultDate: "1989-01-20",
    query: "Case",
    estimatedPages: 25
  },
  {
    naid: "498171322",
    shortName: "WHORM Narcotics",
    title: "Subject Files on Narcotics",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "WHORM subject file",
    defaultDate: "1989-01-20",
    query: "Case",
    estimatedPages: 8,
    excludeTerms: ["donald trump"]
  },
  {
    naid: "498171441",
    shortName: "WHORM Kidnapping/Hostages",
    title: "Subject Files on Kidnapping and Hostages",
    chapter: { number: 2, name: "Counterterrorism" },
    documentType: "WHORM subject file",
    defaultDate: "1989-01-20",
    query: "Case",
    estimatedPages: 8
  }
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
  "libya"
];

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

function dateFor(record, series) {
  return logicalDate(record.coverageStartDate) || logicalDate(record.inclusiveStartDate) || logicalDate(record.productionDateArray?.[0]) || series.defaultDate;
}

function seriesFromRecord(record) {
  const ancestor = (record.ancestors || []).find((item) => SOURCE_SERIES.some((series) => series.naid === String(item.naId)));
  return SOURCE_SERIES.find((series) => series.naid === String(ancestor?.naId));
}

function anySeriesFromRecord(record) {
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

function haystack(record) {
  return normalize([record.title, record.scopeAndContentNote, record.localIdentifier, extent(record)].join(" "));
}

function pdfPageCount(filePath) {
  const output = childProcess.execFileSync("pdfinfo", [filePath], { encoding: "utf8" });
  const match = output.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : 0;
}

function downloadAndCount(object, naid) {
  if (!object?.objectUrl) return null;
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
  return null;
}

function estimatePageInfo(record, series) {
  const folderExtent = /legal/i.test(extent(record)) ? "one legal file folder" : "listed WHORM case file";
  return {
    pageCount: series.estimatedPages,
    pageCountBasis: `estimated from ${folderExtent}; no online declassified PDF listed`
  };
}

function exclusionReason(record, series) {
  const text = haystack(record);
  if (record.levelOfDescription !== "fileUnit") return "Excluded because it is not a file-unit document listing.";
  if (series.keepOnly && !series.keepOnly.includes(String(record.naId))) {
    return "Excluded duplicate San Antonio whole-category listing; retained the scanned whole-category listing only.";
  }
  if (/entire category processed/i.test(record.title || "") && series.naid !== "498171306") {
    return "Excluded whole-category process-control listing where granular case files are also available.";
  }
  if (series.excludeTerms?.some((term) => text.includes(normalize(term)))) {
    return "Excluded as off-topic to FRUS Volume XXVIII despite appearing in a target WHORM subject series.";
  }
  return "";
}

function topicTerms(series) {
  if (series.chapter.name === "Counternarcotics") {
    if (/Drug Summit/i.test(series.title)) return ["drug summit", "narcotics"];
    if (/National Drug Control Policy/i.test(series.title)) return ["drug", "drug policy", "ONDCP"];
    return ["narcotics"];
  }
  return ["hostage", "kidnapping", "terrorism"];
}

function sourceNote(record, series, object, pageInfo) {
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog, Records of the White House Office of Records Management (George H.W. Bush Administration), ${series.title}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    `Series URL: https://catalog.archives.gov/id/${series.naid}.`,
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
  const { record, series, pageInfo } = item;
  const object = digitalObject(record);
  const date = dateFor(record, series);
  const terms = topicTerms(series);
  return {
    id: `whorm-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: series.documentType,
    chapter: series.chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: series.title,
    topicTerms: { [series.chapter.name]: terms },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: pageInfo.pageCount,
    pageCountBasis: pageInfo.pageCountBasis,
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: object ? "WHORM listed case file; PDF available, access may include withdrawals" : "WHORM listed case file; no online declassified PDF",
    accessRestrictionStatus: record.accessRestriction?.status || "",
    scoutCategory: object ? "whorm-listed-pdf" : "whorm-listed-not-online",
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

async function searchCatalog(ancestorNaId, query, from = 0) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", ancestorNaId);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", String(QUERY_ROWS));
  url.searchParams.set("from", String(from));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchSeriesFileUnits() {
  const byNaid = new Map();
  const excluded = [];
  const searchLog = [];

  for (const series of SOURCE_SERIES) {
    let total = 0;
    let returned = 0;
    for (let from = 0; ; from += QUERY_ROWS) {
      const json = await searchCatalog(series.naid, series.query, from);
      const hits = json.body?.hits?.hits || [];
      total = json.body?.hits?.total?.value ?? hits.length;
      returned += hits.length;
      for (const hit of hits) {
        const record = hit._source?.record;
        const hitSeries = record ? seriesFromRecord(record) : null;
        if (!record || !hitSeries || hitSeries.naid !== series.naid) continue;
        const reason = exclusionReason(record, series);
        if (reason) {
          excluded.push({
            naid: String(record.naId),
            title: record.title || "",
            series: series.shortName,
            catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
            reason
          });
          continue;
        }
        byNaid.set(String(record.naId), {
          record,
          series,
          matchedQueries: [`${series.shortName}: ${series.query}`]
        });
      }
      if (!hits.length || from + QUERY_ROWS >= total) break;
    }
    searchLog.push({ series: series.shortName, naid: series.naid, query: series.query, total, returned });
  }

  return { items: [...byNaid.values()], excluded, searchLog };
}

async function broadAudit() {
  const byNaid = new Map();
  const searchLog = [];
  for (const term of BROAD_TERMS) {
    let total = 0;
    let returned = 0;
    for (let from = 0; ; from += QUERY_ROWS) {
      const json = await searchCatalog(WHORM_NAID, term, from);
      const hits = json.body?.hits?.hits || [];
      total = json.body?.hits?.total?.value ?? hits.length;
      returned += hits.length;
      for (const hit of hits) {
        const record = hit._source?.record;
        if (!record || record.levelOfDescription !== "fileUnit") continue;
        const key = String(record.naId);
        const series = anySeriesFromRecord(record);
        const existing = byNaid.get(key) || {
          naid: key,
          title: record.title || "",
          seriesNaid: String(series?.naId || ""),
          seriesTitle: series?.title || "",
          scopeAndContentNote: record.scopeAndContentNote || "",
          catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
          online: Boolean(digitalObject(record)),
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
  const [{ items, excluded, searchLog }, audit] = await Promise.all([fetchSeriesFileUnits(), broadAudit()]);

  for (const item of items) {
    const object = digitalObject(item.record);
    item.pageInfo = downloadAndCount(object, item.record.naId) || estimatePageInfo(item.record, item.series);
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
      reason: "Excluded from primary chronology because the available PDF is a one- or two-page locator/placeholder rather than a substantive case file."
    }));
  const additions = reviewedAdditions.filter((record) => !record.pdfUrl || record.pageCount > 2);
  const additionNaids = new Set(additions.map((record) => record.naid));
  const base = existing.filter((record) => !record.id?.startsWith("whorm-") && !additionNaids.has(record.naid));
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
          naid: WHORM_NAID,
          title: "Records of the White House Office of Records Management (George H.W. Bush Administration)",
          catalogUrl: `https://catalog.archives.gov/id/${WHORM_NAID}`
        },
        sourceSeries: SOURCE_SERIES.map((series) => ({ ...series, catalogUrl: `https://catalog.archives.gov/id/${series.naid}` })),
        searchLog,
        broadAudit: audit,
        selectedRecords: additions.length,
        reviewedTargetSeriesRecords: reviewedAdditions.length,
        measuredRecords: additions.filter((record) => record.pageCountBasis === "measured from available PDF").length,
        estimatedRecords: additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length,
        listedNoOnlinePdfRecords: additions.filter((record) => !record.pdfUrl).length,
        chapterCounts: {
          Counternarcotics: additions.filter((record) => record.chapter.name === "Counternarcotics").length,
          Counterterrorism: additions.filter((record) => record.chapter.name === "Counterterrorism").length
        },
        excludedTargetSeriesRecords: excluded,
        excludedAfterPageReview,
        records: additions
      },
      null,
      2
    )}\n`
  );

  console.log(`Integrated ${additions.length} WHORM case/source files.`);
  console.log(`Measured pages: ${additions.filter((record) => record.pageCountBasis === "measured from available PDF").length}`);
  console.log(`Estimated pages: ${additions.filter((record) => record.pageCountBasis !== "measured from available PDF").length}`);
  console.log(additions.reduce((counts, record) => {
    counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
    return counts;
  }, {}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
