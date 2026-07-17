const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const cacheRoot = path.join(repoRoot, ".cache", "priority-policy-files");
const reportPath = path.join(repoRoot, "reports", "priority-policy-files-harvest.json");

const TARGETS = [
  {
    naid: "366551932",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "Scowcroft policy file",
    matchedQueries: ["Latin America Drug War", "Drug War", "Andean counternarcotics policy"]
  },
  {
    naid: "366551933",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "Scowcroft policy file",
    matchedQueries: ["Latin America Drug War", "Drug War", "Andean counternarcotics policy"]
  },
  {
    naid: "366551934",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "Scowcroft policy file",
    matchedQueries: ["Latin America Drug War", "Drug War", "Andean counternarcotics policy"]
  },
  {
    naid: "366551935",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "Scowcroft policy file",
    matchedQueries: ["Latin America Drug War", "Drug War", "Andean counternarcotics policy"]
  },
  {
    naid: "366551936",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "Scowcroft policy file",
    matchedQueries: ["Latin America Drug War", "Drug War", "Andean counternarcotics policy"]
  },
  {
    naid: "446394946",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "National Security Review file",
    matchedQueries: ["NSR-13", "International Counternarcotics Activities"]
  },
  {
    naid: "446396825",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "National Security Directive file",
    matchedQueries: ["NSD-13", "Cocaine Trafficking"]
  },
  {
    naid: "446396832",
    chapter: { number: 1, name: "Counternarcotics" },
    documentType: "National Security Directive file",
    matchedQueries: ["NSD-18", "International Counternarcotics Strategy"]
  }
];

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

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleDate(title) {
  const exact = clean(title).match(/\b([A-Za-z]+)\s+(\d{1,2}),\s+(19\d{2})\b/);
  if (exact) return `${exact[3]}-${MONTHS[exact[1].toLowerCase()]}-${String(exact[2]).padStart(2, "0")}`;

  const month = clean(title).match(/\b([A-Za-z]+)(?:-[A-Za-z]+)?\s+(19\d{2})\b/);
  if (month) return `${month[2]}-${MONTHS[month[1].toLowerCase()]}-01`;
  return "";
}

function ancestor(record, level) {
  return (record.ancestors || []).find((item) => item.levelOfDescription === level) || {};
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl && /pdf/i.test(object.objectType || object.objectFilename || "")) || {};
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number)
    .filter(Boolean);
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function extent(record) {
  return clean(record.physicalOccurrences?.[0]?.extent || "");
}

function collectionLabel(collection) {
  return /Brent Scowcroft Papers/i.test(collection.title || "")
    ? "Bush Presidential Records, Brent Scowcroft Collection"
    : "Bush Presidential Records, National Security Council";
}

function seriesLabel(series) {
  return clean(series.title)
    .replace(/^H-Files - National Security Review \(NSR\) Files$/i, "H-Files, NSR Files")
    .replace(/^National Security Directives \(NSD\) Files$/i, "H-Files, NSD Files");
}

function sourceNote(record) {
  const collection = ancestor(record, "collection");
  const series = ancestor(record, "series");
  return `Source: George H.W. Bush Library, ${collectionLabel(collection)}, ${seriesLabel(series)}, OA/ID ${record.localIdentifier}, ${clean(record.title)}.`;
}

function catalogTrail(record, object) {
  const collection = ancestor(record, "collection");
  const series = ancestor(record, "series");
  const findingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    collection.naId ? `Collection URL: https://catalog.archives.gov/id/${collection.naId}.` : "",
    series.naId ? `Series URL: https://catalog.archives.gov/id/${series.naId}.` : "",
    object.objectUrl
      ? `Digital object: ${object.objectFilename || "PDF"}, object ID ${object.objectId || "not stated"}, URL ${object.objectUrl}.`
      : "Digital object: none listed in Catalog.",
    findingAids.length ? `Other finding aid identifier: ${findingAids.join(", ")}.` : "",
    extent(record) ? `Extent: ${extent(record)}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Unknown"}.`
  ].filter(Boolean).join(" ");
}

function pageCount(pdfPath) {
  const result = childProcess.spawnSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const match = result.stdout.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

async function fetchRecord(naid) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("q", naid);
  url.searchParams.set("rows", "25");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status} for NAID ${naid}`);
  const json = await response.json();
  const hit = (json.body?.hits?.hits || []).find((item) => String(item._source?.record?.naId) === String(naid));
  if (!hit) throw new Error(`Catalog record ${naid} was not returned`);
  return hit._source.record;
}

async function cachePdf(object, naid) {
  if (!object.objectUrl) return { pageCount: null };
  fs.mkdirSync(cacheRoot, { recursive: true });
  const filename = `${naid}-${path.basename(new URL(object.objectUrl).pathname)}`;
  const pdfPath = path.join(cacheRoot, filename);
  if (!fs.existsSync(pdfPath)) {
    const response = await fetch(object.objectUrl);
    if (!response.ok) throw new Error(`PDF download failed ${response.status}: ${object.objectUrl}`);
    fs.writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));
  }
  return { pageCount: pageCount(pdfPath) };
}

async function toSiteRecord(target) {
  const record = await fetchRecord(target.naid);
  const collection = ancestor(record, "collection");
  const series = ancestor(record, "series");
  const object = digitalObject(record);
  const cached = await cachePdf(object, target.naid);
  const date = titleDate(record.title);
  const note = sourceNote(record);
  return {
    id: `priority-policy-${record.naId}`,
    naid: String(record.naId),
    title: clean(record.title),
    documentTitle: clean(record.title),
    documentType: target.documentType,
    chapter: target.chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: clean(series.title),
    topicTerms: { Counternarcotics: target.matchedQueries },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object.objectUrl || "",
    objectFilename: object.objectFilename || "",
    objectFileSize: object.objectFileSize || null,
    pageCount: cached.pageCount,
    pageCountBasis: cached.pageCount ? "measured from online PDF with pdfinfo" : "online PDF listed; page count not measured",
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: "Online processed folder PDF; verify withdrawal sheets and item-level markings before citation",
    accessRestrictionStatus: record.accessRestriction?.status || "Unknown",
    scoutCategory: "priority-policy-file",
    source: {
      naid: String(series.naId || ""),
      title: clean(series.title),
      shortName: /Scowcroft/i.test(collection.title || "") ? "Scowcroft Latin America Files" : seriesLabel(series),
      url: series.naId ? `https://catalog.archives.gov/id/${series.naId}` : ""
    },
    sourceNote: note,
    frusSourceNote: note,
    catalogTrail: catalogTrail(record, object),
    matchedQueries: target.matchedQueries,
    sourceCollection: collectionLabel(collection),
    sourceFolder: clean(record.title)
  };
}

async function main() {
  const records = [];
  const errors = [];
  for (const target of TARGETS) {
    try {
      records.push(await toSiteRecord(target));
    } catch (error) {
      errors.push({ naid: target.naid, error: error.message });
    }
  }

  records.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    policy: "Focused audit of online Scowcroft Drug War, NSR-13, NSD-13, and NSD-18 source files omitted or under-described by the broad title classifier.",
    targetNaids: TARGETS.map((target) => target.naid),
    recordsReviewed: TARGETS.length,
    recordsCaptured: records.length,
    onlinePdfRecords: records.filter((record) => record.pdfUrl).length,
    measuredRecords: records.filter((record) => record.pageCount).length,
    errors,
    records
  }, null, 2)}\n`);

  console.log(`Captured ${records.length} priority policy files; ${errors.length} errors.`);
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
