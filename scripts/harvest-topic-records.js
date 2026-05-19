const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "topic-records-harvest.json");

const SOURCES = [
  {
    naid: "4522156",
    shortName: "Brent Scowcroft Papers",
    title: "Brent Scowcroft Papers",
    url: "https://catalog.archives.gov/id/4522156"
  },
  {
    naid: "312293887",
    shortName: "NSC Meeting Files",
    title: "H-Files - National Security Council (NSC) Meeting Files",
    url: "https://catalog.archives.gov/id/312293887"
  },
  {
    naid: "312294079",
    shortName: "NSC/DC Meetings",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Files",
    url: "https://catalog.archives.gov/id/312294079"
  },
  {
    naid: "312294094",
    shortName: "NSC/DC Follow-Up",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Follow-Up Files",
    url: "https://catalog.archives.gov/id/312294094"
  },
  {
    naid: "313189297",
    shortName: "NSR Files",
    title: "H-Files - National Security Review (NSR) Files",
    url: "https://catalog.archives.gov/id/313189297"
  },
  {
    naid: "313189290",
    shortName: "NSD Files",
    title: "H-Files - National Security Directive (NSD) Files",
    url: "https://catalog.archives.gov/id/313189290"
  },
  {
    naid: "348937136",
    shortName: "IF Transition",
    title: "Institutional Files - Transition Files",
    url: "https://catalog.archives.gov/id/348937136"
  }
];

const TOPICS = [
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
      "cartel",
      "medellin",
      "cali cartel",
      "interdiction",
      "shipboarding",
      "standoff policy",
      "certification",
      "anti-drug",
      "andean",
      "colombia",
      "peru",
      "bolivia",
      "panama",
      "noriega"
    ]
  },
  {
    chapter: { number: 2, name: "Counterterrorism" },
    terms: [
      "counterterrorism",
      "counter terrorism",
      "counter-terrorism",
      "terrorism",
      "terrorist",
      "terrorists",
      "hostage",
      "hostages",
      "hijacking",
      "hijackers",
      "aviation security",
      "pan am",
      "lockerbie",
      "libya",
      "abu nidal",
      "hezbollah",
      "hizballah",
      "islamic jihad",
      "pflp",
      "hamas",
      "lebanon",
      "beirut",
      "extradition",
      "bombing"
    ]
  }
];

const SEARCH_TERMS = [...new Set(TOPICS.flatMap((topic) => topic.terms))];
const ROWS = 100;
const MAX_FROM = 900;

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
  return (
    logicalDate(record.coverageStartDate) ||
    logicalDate(record.inclusiveStartDate) ||
    logicalDate(record.productionDateArray?.[0]) ||
    "1989-01-20"
  );
}

function sourceFor(record) {
  const ids = new Set([String(record.naId), ...(record.ancestors || []).map((ancestor) => String(ancestor.naId))]);
  return SOURCES.find((source) => ids.has(source.naid));
}

function hasSourceAncestor(record, source) {
  return String(record.naId) === source.naid || (record.ancestors || []).some((ancestor) => String(ancestor.naId) === source.naid);
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function haystackFor(record) {
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

function matchedTopicTerms(record) {
  const haystack = haystackFor(record);
  return TOPICS.map((topic) => ({
    topic,
    terms: topic.terms.filter((term) => haystack.includes(normalize(term)))
  })).filter((match) => match.terms.length);
}

function primaryTopic(record) {
  const matches = matchedTopicTerms(record).sort((a, b) => b.terms.length - a.terms.length || a.topic.chapter.number - b.topic.chapter.number);
  return matches[0]?.topic || TOPICS[0];
}

function titleKind(title) {
  if (/memcon|memorandum of conversation|telephone call/i.test(title)) return "Memcon/Telcon";
  if (/meeting|minutes|deputies committee|nsc\/dc|nsc meeting/i.test(title)) return "Meeting minutes";
  if (/memorandum|memo|briefing|paper|report|strategy|directive|nsd-|nsr-|transition/i.test(title)) return "Memo";
  return "Source file";
}

function sourceNote(record, source, object) {
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  return [
    `Source: National Archives Catalog, ${source.title}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    `Series/collection URL: ${source.url}.`,
    object ? `Digital object: ${object.objectFilename}, object ID ${object.objectId}, URL ${object.objectUrl}.` : "Digital object: none listed in Catalog.",
    foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}.` : "",
    otherFindingAids.length ? `Other finding aid identifier: ${otherFindingAids.join(", ")}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Unknown"}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function toSiteRecord(record, matchedQueries) {
  const source = sourceFor(record);
  const object = digitalObject(record);
  const topic = primaryTopic(record);
  const topicTerms = matchedTopicTerms(record);
  const date = dateFor(record);
  return {
    id: `catalog-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: titleKind(record.title || ""),
    chapter: topic.chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: record.title || "",
    topicTerms: Object.fromEntries(topicTerms.map((match) => [match.topic.chapter.name, match.terms])),
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: null,
    pageCountBasis: object ? "not yet measured" : "no digital object listed",
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    releaseStatus: record.accessRestriction?.status || "",
    source: source
      ? {
          naid: source.naid,
          title: source.title,
          shortName: source.shortName,
          url: source.url
        }
      : null,
    sourceNote: source ? sourceNote(record, source, object) : "",
    matchedQueries: [...matchedQueries].sort()
  };
}

async function fetchCatalogPage(query, from) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("q", query);
  url.searchParams.set("rows", String(ROWS));
  url.searchParams.set("from", String(from));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status}: ${url}`);
  return response.json();
}

async function harvestRecords() {
  const recordsByNaid = new Map();
  const queryStats = [];

  for (const source of SOURCES) {
    for (const term of SEARCH_TERMS) {
      const query = `${term} ${source.naid}`;
      let hitsSeen = 0;
      let matches = 0;

      for (let from = 0; from <= MAX_FROM; from += ROWS) {
        const json = await fetchCatalogPage(query, from);
        const hits = json.body?.hits?.hits || [];
        hitsSeen += hits.length;
        if (!hits.length) break;

        for (const hit of hits) {
          const record = hit._source?.record;
          if (!record || record.levelOfDescription !== "fileUnit") continue;
          if (!hasSourceAncestor(record, source)) continue;
          if (!matchedTopicTerms(record).length) continue;

          const key = String(record.naId);
          const existing = recordsByNaid.get(key);
          if (existing) {
            existing.matchedQueries.add(query);
          } else {
            recordsByNaid.set(key, { record, matchedQueries: new Set([query]) });
          }
          matches += 1;
        }
      }

      queryStats.push({ source: source.shortName, naid: source.naid, term, query, hitsSeen, matches });
    }
  }

  const records = [...recordsByNaid.values()]
    .map(({ record, matchedQueries }) => toSiteRecord(record, matchedQueries))
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));

  return { records, queryStats };
}

async function main() {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const { records, queryStats } = await harvestRecords();
  const json = JSON.stringify(records, null, 2);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sources: SOURCES,
        searchTerms: SEARCH_TERMS,
        harvestedRecords: records.length,
        onlinePdfRecords: records.filter((record) => record.pdfUrl).length,
        chapterCounts: Object.fromEntries(TOPICS.map((topic) => [topic.chapter.name, records.filter((record) => record.chapter.name === topic.chapter.name).length])),
        documentTypeCounts: records.reduce((counts, record) => {
          counts[record.documentType] = (counts[record.documentType] || 0) + 1;
          return counts;
        }, {}),
        sourceCounts: Object.fromEntries(SOURCES.map((source) => [source.shortName, records.filter((record) => record.source?.naid === source.naid).length])),
        queryStats,
        records
      },
      null,
      2
    )}\n`
  );

  console.log(`Harvested ${records.length} topic records.`);
  console.log(
    TOPICS.map((topic) => `${topic.chapter.name}: ${records.filter((record) => record.chapter.name === topic.chapter.name).length}`).join(" | ")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
