const fs = require("fs");
const path = require("path");
const { notesFromCatalogRecord } = require("./frus-source-notes");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "presidential-conversation-harvest.json");

const ROWS = 100;
const FETCH_TIMEOUT_MS = 15000;

const SERIES = [
  {
    naid: "321498039",
    title: "Presidential Memcon Files",
    shortName: "Presidential Memcon Files",
    documentType: "Memcon"
  },
  {
    naid: "321498139",
    title: "Presidential Telcon Files",
    shortName: "Presidential Telcon Files",
    documentType: "Telcon"
  }
];

const QUERY_GROUPS = {
  Counternarcotics: [
    "narcotics",
    "drug",
    "drugs",
    "cocaine",
    "cartel",
    "cartels",
    "counternarcotics",
    "counter narcotics",
    "counter-narcotics",
    "drug summit",
    "drug trafficking",
    "drug interdiction",
    "narcotics interdiction",
    "shipboarding",
    "Medellin",
    "Cali cartel",
    "Andean"
  ],
  Counterterrorism: [
    "terrorism",
    "terrorist",
    "counterterrorism",
    "counter terrorism",
    "counter-terrorism",
    "hostage",
    "hostages",
    "hijacking",
    "hijacker",
    "Pan Am 103",
    "Lockerbie",
    "aviation security",
    "Lockerbie extradition",
    "terrorist extradition",
    "Qadhafi",
    "Gaddafi",
    "Libyan terrorism",
    "Libya terrorism",
    "Abu Nidal",
    "Hezbollah",
    "Hizballah",
    "Islamic Jihad",
    "PFLP",
    "Hamas"
  ]
};

const CHAPTERS = {
  Counternarcotics: { number: 1, name: "Counternarcotics" },
  Counterterrorism: { number: 2, name: "Counterterrorism" }
};

function logicalDate(date) {
  return date?.logicalDate || "";
}

function dateFor(record) {
  return logicalDate(record.productionDates?.[0]) || logicalDate(record.coverageStartDate) || logicalDate(record.inclusiveStartDate) || "";
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl) || null;
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

async function searchCatalog(series, query, from = 0) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", series.naid);
  url.searchParams.set("q", query);
  url.searchParams.set("rows", String(ROWS));
  url.searchParams.set("from", String(from));
  const json = await fetchJson(url);
  const hits = json.body?.hits?.hits || [];
  const total = json.body?.hits?.total?.value ?? hits.length;
  return { hits, total, url: String(url) };
}

function chapterFor(match) {
  const cn = match.queryMatches.Counternarcotics.length;
  const ct = match.queryMatches.Counterterrorism.length;
  if (ct > cn) return CHAPTERS.Counterterrorism;
  return CHAPTERS.Counternarcotics;
}

function documentTypeFor(record, series) {
  const title = record.title || "";
  if (/telcon|telephone|phone call|call to|call from|president'?s call|points to be made for telephone call/i.test(title)) {
    return "Telcon";
  }
  if (/meeting|luncheon|lunch|plenary|bilateral|session|one-on-one|credentials/i.test(title)) {
    return "Memcon";
  }
  return series.documentType;
}

function toSiteRecord(match) {
  const { record, series } = match;
  const object = digitalObject(record);
  const chapter = chapterFor(match);
  const date = dateFor(record);
  const terms = match.queryMatches[chapter.name];
  const notes = notesFromCatalogRecord(record, series, object);

  return {
    id: `conversation-${record.naId}`,
    naid: String(record.naId),
    title: record.title || `Catalog record ${record.naId}`,
    documentTitle: record.title || `Catalog record ${record.naId}`,
    documentType: documentTypeFor(record, series),
    chapter,
    date,
    sortDate: date,
    dateLine: date,
    subjectLine: record.title || "",
    topicTerms: { [chapter.name]: terms },
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    objectFileSize: object?.objectFileSize || null,
    pageCount: null,
    pageCountBasis: "not yet measured",
    localIdentifier: record.localIdentifier || "",
    containerId: "",
    releaseStatus: "Declassified presidential conversation; PDF available",
    accessRestrictionStatus: record.accessRestriction?.status || "",
    scoutCategory: "declassified-presidential-conversation",
    source: {
      naid: series.naid,
      title: series.title,
      shortName: series.shortName,
      url: `https://catalog.archives.gov/id/${series.naid}`
    },
    sourceNote: notes.sourceNote,
    frusSourceNote: notes.sourceNote,
    catalogTrail: notes.catalogTrail,
    matchedQueries: [...new Set([...match.queryMatches.Counternarcotics, ...match.queryMatches.Counterterrorism])]
  };
}

async function main() {
  const byNaid = new Map();
  const searchLog = [];

  for (const series of SERIES) {
    for (const [chapterName, queries] of Object.entries(QUERY_GROUPS)) {
      for (const query of queries) {
        let total = 0;
        let returned = 0;
        let error = "";
        for (let from = 0; ; from += ROWS) {
          let result;
          try {
            result = await searchCatalog(series, query, from);
          } catch (searchError) {
            error = searchError.message;
            break;
          }
          total = result.total;
          returned += result.hits.length;
          for (const hit of result.hits) {
            const record = hit._source?.record;
            if (!record || record.levelOfDescription !== "item") continue;
            const object = digitalObject(record);
            if (!object?.objectUrl) continue;
            if ((record.accessRestriction?.status || "").toLowerCase() !== "unrestricted") continue;
            const key = String(record.naId);
            const existing = byNaid.get(key) || {
              record,
              series,
              queryMatches: {
                Counternarcotics: [],
                Counterterrorism: []
              }
            };
            if (!existing.queryMatches[chapterName].includes(query)) {
              existing.queryMatches[chapterName].push(query);
            }
            byNaid.set(key, existing);
          }
          if (!result.hits.length || from + ROWS >= total) break;
        }
        searchLog.push({ seriesNaid: series.naid, seriesTitle: series.title, chapterName, query, total, returned, error });
      }
    }
  }

  const matches = [...byNaid.values()];
  const records = matches
    .map(toSiteRecord)
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
  const json = JSON.stringify(records, null, 2);

  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        policy: "Direct sweep of Presidential Memcon and Telcon Files. Public site includes only unrestricted item-level presidential conversations with online PDFs that matched counternarcotics or counterterrorism topic queries.",
        series: SERIES,
        queryGroups: QUERY_GROUPS,
        searchLog,
        reviewedMatches: matches.length,
        recordsAdded: records.length,
        chapterCounts: records.reduce((counts, record) => {
          counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
          return counts;
        }, {}),
        records
      },
      null,
      2
    )}\n`
  );

  console.log(`Integrated ${records.length} declassified presidential conversations.`);
  console.log(records.reduce((counts, record) => {
    counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
    return counts;
  }, {}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
