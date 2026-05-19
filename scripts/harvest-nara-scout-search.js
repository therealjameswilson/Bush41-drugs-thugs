const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const rawPath = path.join(repoRoot, "reports", "nara-scout-terrorism-narcotics-raw.json");
const auditPath = path.join(repoRoot, "reports", "nara-scout-volume28-candidates.json");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");

const PROXY_URL = "https://nara-proxy.mzqmpgyvdv.workers.dev";
const API_KEY = "C6O0DyEcap6taVb24zymF5AOMQvwTXsa7q0ZH8cN";
const NARA_PATH = "/records/search";
const QUERY = "terrorism OR narcotics";
const PER_COLLECTION_LIMIT = 25;

const BUSH41_COLLECTIONS =
  "138924378,595138,2163559,567670,472456042,2163595,2163571,488763126,2163588,720635,2163589,650839,284825749,2163563,2163599,488763107,2163594,2163570,2163558,2103233,488763114,2163600,2579957,2163569,2575518,2163581,2163580,2133275,2163582,2163565,2163587,2163575,2163562,2163576,2163584,2575614,2163593,488763132,2163556,2577734,578954,2163572,2163566,2163561,2163573,2578586,2163596,2163590,580456,2163574,490670241,2163567,573356,2163578,2575552,2579595,2163585,2163568,2163597,2163579,2579969,2163592,572260,922149,891537,650835,2579439,2578935,2579607,2575558".split(",");

const CHAPTERS = [
  {
    chapter: { number: 1, name: "Counternarcotics" },
    terms: [
      "narcotics",
      "counternarcotics",
      "counter narcotics",
      "counter-narcotics",
      "drug",
      "drugs",
      "cocaine",
      "cartel",
      "medellin",
      "cali",
      "interdiction",
      "shipboarding",
      "standoff",
      "andean",
      "colombia",
      "peru",
      "bolivia",
      "panama",
      "noriega"
    ],
    negative: ["drug test", "drug testing", "prescription drug", "food and drug"]
  },
  {
    chapter: { number: 2, name: "Counterterrorism" },
    terms: [
      "terrorism",
      "terrorist",
      "counterterrorism",
      "counter terrorism",
      "counter-terrorism",
      "hostage",
      "hostages",
      "hijacking",
      "aviation security",
      "pan am",
      "lockerbie",
      "libya",
      "qadhafi",
      "gaddafi",
      "abu nidal",
      "hezbollah",
      "hizballah",
      "islamic jihad",
      "pflp",
      "hamas",
      "extradition",
      "bombing"
    ],
    negative: []
  }
];

const WITHDRAWAL_RE = /withdraw(al)?\s*(sheet|notice|card)|NA\s*Form\s*1402[13]/i;

// Human review of the 222 visible NARA Scout results. Keep the site focused on
// source files with plausible FRUS documentary value, not appointment, polling,
// domestic-event logistics, public liaison, pardon, or generic press files.
const INCLUDE_NAIDS = new Set([
  // Counternarcotics: presidential-level conversations and meetings
  "428082203", // Fujimori telcon
  "428081887", // Fujimori meeting
  "428081889", // Fujimori luncheon
  "428082499", // Gaviria telcon
  "428081077", // Gaviria memcon
  "428080733", // Barco memcon

  // Counternarcotics anchoring event files
  "492080177", // San Antonio Narcotics Summit
  "492080178", // San Antonio Narcotics Summit breakfast with President Salinas
  "492080179", // San Antonio Narcotics Summit luncheon
  "486208889", // Narcotics Summit scheduling/event file [1]
  "486208890", // Narcotics Summit scheduling/event file [2]
  "486208891", // Narcotics Summit scheduling/event file [3]

  // Counterterrorism: meetings and substantive report files
  "492070600", // Anti-Terrorism Amendments meeting
  "498156289" // President's Commission on Aviation Security and Terrorism
]);

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
    const month = MONTHS[longDate[1].toLowerCase()];
    return `${longDate[3]}-${month}-${String(longDate[2]).padStart(2, "0")}`;
  }

  const bracketYear = title.match(/\[(19\d{2}|20\d{2})\]/);
  if (bracketYear) return `${bracketYear[1]}-01-01`;

  return "";
}

function dateFor(record) {
  return (
    logicalDate(record.coverageStartDate) ||
    logicalDate(record.inclusiveStartDate) ||
    logicalDate(record.productionDateArray?.[0]) ||
    titleDate(record) ||
    ""
  );
}

function yearFor(record) {
  const date = dateFor(record);
  if (date) return Number(date.slice(0, 4));
  return record.coverageStartDate?.year || record.inclusiveStartDate?.year || record.productionDateArray?.[0]?.year || null;
}

function haystack(record) {
  return normalize(
    [
      record.title,
      record.scopeAndContentNote,
      record.localIdentifier,
      record.generalNotes?.join(" "),
      record.digitalObjects?.map((object) => object.objectFilename).join(" ")
    ].join(" ")
  );
}

function classify(record) {
  const title = record.title || "";
  const desc = record.scopeAndContentNote || "";
  const online = Array.isArray(record.digitalObjects) && record.digitalObjects.length > 0;
  const restrictions = record.accessRestriction?.specificAccessRestrictions || [];
  const restrictionTypes = restrictions.map((item) => (item.restriction || "").toUpperCase());
  const foia = restrictionTypes.some((item) => /FOIA/.test(item));
  const pra = restrictionTypes.some((item) => /PRA|PRESIDENTIAL.RECORDS/.test(item));
  const looksWithdrawal = WITHDRAWAL_RE.test(title) || WITHDRAWAL_RE.test(desc);

  if (looksWithdrawal || foia || pra) return { category: "withdrawal", online, foia, pra, restrictionTypes };
  if (online) return { category: "declassified", online, foia, pra, restrictionTypes };
  if (!desc.trim() || desc.trim().length < 20) return { category: "unprocessed", online, foia, pra, restrictionTypes };
  return { category: "other", online, foia, pra, restrictionTypes };
}

function matchChapter(record) {
  const text = haystack(record);
  const matches = CHAPTERS.map((chapter) => {
    const terms = chapter.terms.filter((term) => text.includes(normalize(term)));
    const negatives = chapter.negative.filter((term) => text.includes(normalize(term)));
    return { chapter: chapter.chapter, terms, negatives, score: terms.length - negatives.length * 2 };
  })
    .filter((match) => match.terms.length && match.score > 0)
    .sort((a, b) => b.score - a.score || a.chapter.number - b.chapter.number);
  return matches[0] || null;
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function ancestor(record, level) {
  return (record.ancestors || []).find((item) => item.levelOfDescription === level);
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function documentType(record) {
  const title = record.title || "";
  if (/summit|commission/i.test(title)) return "Anchoring event file";
  if (/memcon|memorandum of conversation|telcon|telephone call/i.test(title)) return "Memcon/Telcon";
  if (/luncheon with/i.test(title)) return "Meeting minutes";
  if (/meeting|minutes|deputies committee|nsc\/dc|principals committee|nsc meeting/i.test(title)) return "Meeting minutes";
  if (/memorandum|memo|briefing|paper|report|strategy|directive|nsd-|nsr-|transition/i.test(title)) return "Memo";
  if (/withdraw/i.test(title)) return "Withdrawal sheet";
  return "Source file";
}

function sourceNote(record, object) {
  const series = ancestor(record, "series");
  const collection = ancestor(record, "collection");
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog${collection?.title ? `, ${collection.title}` : ""}${series?.title ? `, ${series.title}` : ""}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    series?.naId ? `Series URL: https://catalog.archives.gov/id/${series.naId}.` : "",
    object ? `Digital object: ${object.objectFilename}, object ID ${object.objectId}, URL ${object.objectUrl}.` : "Digital object: none listed in Catalog.",
    foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}.` : "",
    otherFindingAids.length ? `Other finding aid identifier: ${otherFindingAids.join(", ")}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Unknown"}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function toSiteRecord(record, match, scoutCategory) {
  const object = digitalObject(record);
  const series = ancestor(record, "series");
  const collection = ancestor(record, "collection");
  const date = dateFor(record) || `${yearFor(record) || 1989}-01-01`;
  const type = documentType(record);
  const estimatedEventPages = type === "Anchoring event file" && !object ? 25 : null;
  return {
    id: `catalog-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: type,
    chapter: match.chapter,
    date,
    sortDate: date,
    dateLine: dateFor(record) || (yearFor(record) ? String(yearFor(record)) : "Date pending"),
    subjectLine: record.title || "",
    topicTerms: { [match.chapter.name]: match.terms },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: estimatedEventPages,
    pageCountBasis: estimatedEventPages ? "estimated from one legal file folder event package" : object ? "not yet measured" : "no digital object listed",
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: record.accessRestriction?.status || "",
    scoutCategory,
    source: {
      naid: String(series?.naId || collection?.naId || ""),
      title: series?.title || collection?.title || "",
      shortName: series?.title || collection?.title || "National Archives Catalog",
      url: series?.naId ? `https://catalog.archives.gov/id/${series.naId}` : collection?.naId ? `https://catalog.archives.gov/id/${collection.naId}` : ""
    },
    sourceNote: sourceNote(record, object),
    matchedQueries: [QUERY]
  };
}

async function fetchOne(ancestorNaId) {
  const params = new URLSearchParams();
  params.append("q", QUERY);
  params.append("ancestorNaId", ancestorNaId);
  params.append("limit", String(PER_COLLECTION_LIMIT));
  const response = await fetch(`${PROXY_URL}${NARA_PATH}?${params.toString()}`, {
    headers: { "x-api-key": API_KEY, Accept: "application/json" }
  });
  if (!response.ok) return { ancestorNaId, hits: [], total: 0, error: `HTTP ${response.status}` };
  const json = await response.json();
  const body = json.body || json;
  return {
    ancestorNaId,
    hits: body.hits?.hits || [],
    total: body.hits?.total?.value ?? body.hits?.total ?? 0
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

async function main() {
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });

  const collectionResults = await mapLimit(BUSH41_COLLECTIONS, 8, fetchOne);
  const recordsByNaid = new Map();

  for (const result of collectionResults) {
    for (const hit of result.hits) {
      const record = hit._source?.record || hit._source || hit;
      if (record?.naId && !recordsByNaid.has(String(record.naId))) {
        recordsByNaid.set(String(record.naId), record);
      }
    }
  }

  const rawRecords = [...recordsByNaid.values()];
  const displayedRecords = rawRecords.filter((record) => classify(record).category !== "other");
  const topicHits = displayedRecords
    .map((record) => ({ record, classification: classify(record), match: matchChapter(record), year: yearFor(record) }))
    .filter(({ match, year }) => match && (!year || (year >= 1989 && year <= 1992)))
    .map(({ record, classification, match }) => toSiteRecord(record, match, classification.category))
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));

  const candidates = topicHits
    .filter((record) => INCLUDE_NAIDS.has(record.naid))
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));

  const rawReport = {
    generatedAt: new Date().toISOString(),
    sourceUrl: "https://therealjameswilson.github.io/nara-scout/#q=terrorism+OR+narcotics&sort=relevance&perColl=25&perPage=50&scope=bush41",
    query: QUERY,
    scope: "All Bush 41 collections",
    perCollectionLimit: PER_COLLECTION_LIMIT,
    collectionCount: BUSH41_COLLECTIONS.length,
    collectionResults: collectionResults.map((result) => ({
      ancestorNaId: result.ancestorNaId,
      total: result.total,
      returned: result.hits.length,
      error: result.error || ""
    })),
    uniqueRecords: rawRecords.length,
    displayedByScoutFilters: displayedRecords.length,
    records: rawRecords
  };

  const audit = {
    generatedAt: rawReport.generatedAt,
    sourceUrl: rawReport.sourceUrl,
    uniqueRecordsReviewed: rawRecords.length,
    displayedByScoutFilters: displayedRecords.length,
    topicHitsBeforeCompilerReview: topicHits.length,
    candidatesForVolume28: candidates.length,
    chapterCounts: Object.fromEntries(CHAPTERS.map((chapter) => [chapter.chapter.name, candidates.filter((record) => record.chapter.name === chapter.chapter.name).length])),
    onlinePdfRecords: candidates.filter((record) => record.pdfUrl).length,
    excludedTopicHits: topicHits
      .filter((record) => !INCLUDE_NAIDS.has(record.naid))
      .map((record) => ({
        naid: record.naid,
        title: record.title,
        chapter: record.chapter.name,
        source: record.source?.shortName || "",
        reason: "Topic hit from NARA Scout, but lower FRUS value after review: likely appointment/personnel, public liaison, press/polling, event logistics, pardon/OIC, or otherwise too generic from title metadata alone."
      })),
    candidates
  };

  const json = JSON.stringify(candidates, null, 2);
  fs.writeFileSync(rawPath, `${JSON.stringify(rawReport, null, 2)}\n`);
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);

  console.log(`Reviewed ${rawRecords.length} unique NARA Scout records (${displayedRecords.length} displayed by Scout filters).`);
  console.log(`Selected ${candidates.length} candidates for Volume XXVIII.`);
  console.log(audit.chapterCounts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
