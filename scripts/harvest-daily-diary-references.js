const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const paths = {
  records: path.join(repoRoot, "data", "records.json"),
  recordsScript: path.join(repoRoot, "data", "records.js"),
  scheduleReferences: path.join(repoRoot, "data", "schedule-references.json"),
  scheduleReferencesScript: path.join(repoRoot, "data", "schedule-references.js"),
  report: path.join(repoRoot, "reports", "daily-diary-references-harvest.json")
};

const SERIES_NAID = "186322";
const SERIES_TITLE = "Presidential Daily Diary and Presidential Daily Backup Materials";
const COLLECTION_TITLE = "Bush Presidential Records, White House Office of Appointments and Scheduling Files";
const SERIES_URL = `https://catalog.archives.gov/id/${SERIES_NAID}`;
const CATALOG_SEARCH_URL = "https://catalog.archives.gov/proxy/records/search";
const ROWS = 50;
const CONCURRENCY = 6;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAndScript(jsonPath, scriptPath, globalName, data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(jsonPath, `${json}\n`);
  fs.writeFileSync(scriptPath, `window.${globalName} = ${json};\n`);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dateToNumeric(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

function dateToQueryVariants(date) {
  const [year, month, day] = date.split("-").map(Number);
  const monthPadded = String(month).padStart(2, "0");
  const dayPadded = String(day).padStart(2, "0");
  return [
    `${month}/${day}/${year}`,
    `${month}/${dayPadded}/${year}`,
    `${monthPadded}/${day}/${year}`,
    `${monthPadded}/${dayPadded}/${year}`,
    `${MONTHS[month - 1]} ${day}, ${year}`
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function titleDate(title) {
  const value = clean(title);
  let match = value.match(/\] (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;

  match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\b/i);
  if (!match) return "";
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[1].toLowerCase()) + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

function referenceType(title) {
  if (/\[Presidential Daily Backup\]/i.test(title)) return "Presidential Daily Backup";
  if (/\[Presidential Daily Diary\]/i.test(title)) return "Presidential Daily Diary";
  if (/President'?s Daily Diary Entry/i.test(title)) return "President's Daily Diary Entry";
  return "";
}

function digitalObject(record) {
  const objects = record.digitalObjects || [];
  return objects.find((object) => /pdf/i.test(object.objectType || object.objectFilename || "")) || objects[0] || {};
}

function containerId(record) {
  return (record.physicalOccurrences || [])
    .flatMap((occurrence) => occurrence.mediaOccurrences || [])
    .map((occurrence) => occurrence.containerId)
    .filter(Boolean)[0] || "";
}

function sourceNote(record) {
  return [
    "Source: George H.W. Bush Library",
    COLLECTION_TITLE,
    SERIES_TITLE,
    record.localIdentifier ? `OA/ID ${record.localIdentifier}` : "",
    clean(record.title)
  ].filter(Boolean).join(", ") + ".";
}

function catalogTrail(record, object) {
  return [
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    `Series URL: ${SERIES_URL}.`,
    object.objectFilename || object.objectUrl
      ? `Digital object: ${[object.objectFilename, object.objectId ? `object ID ${object.objectId}` : "", object.objectUrl ? `URL ${object.objectUrl}` : ""].filter(Boolean).join(", ")}.`
      : "",
    record.accessRestriction?.status ? `Access restriction: ${record.accessRestriction.status}.` : "",
    record.useRestriction?.status ? `Use restriction: ${record.useRestriction.status}.` : ""
  ].filter(Boolean).join(" ");
}

function toScheduleReference(record) {
  const object = digitalObject(record);
  const date = titleDate(record.title);
  return {
    id: `schedule-${record.naId}`,
    naid: String(record.naId),
    date,
    title: clean(record.title),
    documentType: referenceType(record.title),
    levelOfDescription: record.levelOfDescription || "",
    localIdentifier: record.localIdentifier || "",
    containerId: containerId(record),
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    seriesUrl: SERIES_URL,
    pdfUrl: object.objectUrl || "",
    objectFilename: object.objectFilename || "",
    objectFileSize: object.objectFileSize || "",
    digitalObjectCount: (record.digitalObjects || []).length,
    releaseStatus: record.useRestriction?.status || "",
    accessRestrictionStatus: record.accessRestriction?.status || "",
    isEmptyDiary: /\[EMPTY\]/i.test(record.title || ""),
    sourceNote: sourceNote(record),
    catalogTrail: catalogTrail(record, object),
    matchScope: "Same-day Presidential Daily Diary/Daily Backup schedule-control source. Use to verify appointment/call time, place, and calendar context; do not treat as a substantive memcon/telcon transcript."
  };
}

async function fetchJson(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();
    clearTimeout(timer);

    if (!response.ok || /^\s*</.test(text)) {
      throw new Error(`Catalog response was not JSON: HTTP ${response.status}`);
    }
    return JSON.parse(text);
  } catch (error) {
    clearTimeout(timer);
    if (attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    return fetchJson(url, attempt + 1);
  }
}

async function searchDate(date) {
  const recordsByNaid = new Map();
  const queryResults = [];

  for (const query of dateToQueryVariants(date)) {
    const url = new URL(CATALOG_SEARCH_URL);
    url.searchParams.set("ancestorNaId", SERIES_NAID);
    url.searchParams.set("q", `"${query}"`);
    url.searchParams.set("rows", String(ROWS));
    const json = await fetchJson(url);
    const records = (json.body?.hits?.hits || []).map((hit) => hit._source?.record).filter(Boolean);
    for (const record of records) recordsByNaid.set(String(record.naId), record);
    queryResults.push({
      query,
      total: json.body?.hits?.total?.value ?? records.length,
      hits: records.length
    });
  }

  const records = [...recordsByNaid.values()];
  const references = records
    .filter((record) => titleDate(record.title) === date)
    .filter((record) => referenceType(record.title))
    .map(toScheduleReference);

  return {
    date,
    query: dateToNumeric(date),
    queryResults,
    references
  };
}

async function mapLimit(values, limit, worker) {
  const queue = [...values];
  const results = [];
  async function run() {
    while (queue.length) {
      const value = queue.shift();
      results.push(await worker(value));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return results;
}

function scheduleSummary(reference) {
  const empty = reference.isEmptyDiary ? " [empty diary file]" : "";
  const objects = reference.digitalObjectCount ? `; ${reference.digitalObjectCount} digital object${reference.digitalObjectCount === 1 ? "" : "s"}` : "";
  return `${reference.documentType}: ${reference.title}${empty}${objects}; ${reference.catalogUrl}`;
}

function attachReferences(records, referencesByDate) {
  return records.map((record) => {
    const references = referencesByDate.get(record.date) || [];
    return {
      ...record,
      scheduleReferences: references.map((reference) => ({
        id: reference.id,
        naid: reference.naid,
        title: reference.title,
        documentType: reference.documentType,
        date: reference.date,
        localIdentifier: reference.localIdentifier,
        catalogUrl: reference.catalogUrl,
        pdfUrl: reference.pdfUrl,
        digitalObjectCount: reference.digitalObjectCount,
        isEmptyDiary: reference.isEmptyDiary,
        sourceNote: reference.sourceNote,
        catalogTrail: reference.catalogTrail,
        matchBasis: reference.matchScope
      })),
      scheduleReferenceSummary: references.length
        ? references.map(scheduleSummary).join(" | ")
        : ""
    };
  });
}

async function main() {
  const records = readJson(paths.records).map((record) => {
    const { scheduleReferences, scheduleReferenceSummary, ...rest } = record;
    void scheduleReferences;
    void scheduleReferenceSummary;
    return rest;
  });
  const dates = [...new Set(records.map((record) => record.date).filter(Boolean))].sort();
  const dateResults = (await mapLimit(dates, CONCURRENCY, searchDate)).sort((a, b) => a.date.localeCompare(b.date));
  const errors = [];
  const referencesByNaid = new Map();
  const referencesByDate = new Map();

  for (const result of dateResults) {
    for (const reference of result.references) {
      referencesByNaid.set(reference.naid, reference);
      if (!referencesByDate.has(reference.date)) referencesByDate.set(reference.date, []);
      referencesByDate.get(reference.date).push(reference);
    }
  }

  for (const [date, references] of referencesByDate.entries()) {
    references.sort((a, b) => {
      const order = ["President's Daily Diary Entry", "Presidential Daily Diary", "Presidential Daily Backup"];
      return order.indexOf(a.documentType) - order.indexOf(b.documentType) || a.title.localeCompare(b.title);
    });
    referencesByDate.set(date, references);
  }

  const scheduleReferences = [...referencesByNaid.values()].sort((a, b) => {
    return a.date.localeCompare(b.date) || a.documentType.localeCompare(b.documentType) || a.title.localeCompare(b.title);
  });
  const enrichedRecords = attachReferences(records, referencesByDate);
  const recordDatesWithReferences = new Set(scheduleReferences.map((reference) => reference.date));

  writeJsonAndScript(paths.scheduleReferences, paths.scheduleReferencesScript, "FRUS_SCHEDULE_REFERENCES", scheduleReferences);
  writeJsonAndScript(paths.records, paths.recordsScript, "FRUS_RECORDS", enrichedRecords);

  fs.writeFileSync(
    paths.report,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        series: {
          naid: SERIES_NAID,
          title: SERIES_TITLE,
          url: SERIES_URL
        },
        matchMethod: "Exact-date query under NAID 186322 using quoted M/D/YYYY dates from the Volume XXVIII memcon/telcon chronology.",
        scopeNote: "These are same-day schedule-control references from the Presidential Daily Diary/Daily Backup series. They should be used for calendar corroboration and FRUS editorial notes, not as substitute conversation transcripts.",
        recordCount: records.length,
        uniqueRecordDates: dates.length,
        scheduleReferenceCount: scheduleReferences.length,
        datesWithScheduleReferences: recordDatesWithReferences.size,
        recordsWithScheduleReferences: enrichedRecords.filter((record) => record.scheduleReferences?.length).length,
        recordsWithoutScheduleReferences: enrichedRecords.filter((record) => !record.scheduleReferences?.length).length,
        byType: scheduleReferences.reduce((acc, reference) => {
          acc[reference.documentType] = (acc[reference.documentType] || 0) + 1;
          return acc;
        }, {}),
        unmatchedDates: dates.filter((date) => !recordDatesWithReferences.has(date)),
        queryAudit: dateResults.map((result) => ({
          date: result.date,
          query: result.query,
          queryResults: result.queryResults,
          keptReferences: result.references.map((reference) => reference.naid)
        })),
        errors
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
