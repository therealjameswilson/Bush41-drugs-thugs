const fs = require("fs");
const path = require("path");
const { notesFromSiteRecord } = require("./frus-source-notes");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "memcon-telcon-refinement.json");

function isConversation(record) {
  const text = [
    record.title,
    record.documentTitle,
    record.documentType,
    record.source?.shortName,
    record.sourceNote
  ].join(" ");

  return /memcon|memorandum of conversation|telcon|telephone conversation|telephone call|meeting with .*president|luncheon with .*president/i.test(text);
}

function documentType(record) {
  return /telcon|telephone/i.test(record.title || "") ? "Telcon" : "Memcon";
}

function main() {
  const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const included = records
    .filter((record) => record.pdfUrl && isConversation(record))
    .map((record) => {
      const notes = notesFromSiteRecord(record);
      return {
        ...record,
        documentType: documentType(record),
        scoutCategory: "declassified-memcon-telcon",
        releaseStatus: "Declassified presidential conversation; PDF available",
        sourceNote: notes.sourceNote,
        frusSourceNote: notes.sourceNote,
        catalogTrail: notes.catalogTrail
      };
    })
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));

  const includedNaids = new Set(included.map((record) => record.naid));
  const excluded = records
    .filter((record) => !includedNaids.has(record.naid))
    .map((record) => ({
      naid: record.naid,
      title: record.title,
      chapter: record.chapter?.name,
      documentType: record.documentType,
      catalogUrl: record.catalogUrl,
      reason: record.pdfUrl ? "Not a declassified memcon/telcon conversation file." : "No online declassified PDF."
    }));

  const json = JSON.stringify(included, null, 2);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        policy: "Public site narrowed to declassified memcons and telcons with online PDFs only.",
        includedRecords: included.length,
        excludedRecords: excluded.length,
        chapterCounts: included.reduce((counts, record) => {
          counts[record.chapter.name] = (counts[record.chapter.name] || 0) + 1;
          return counts;
        }, {}),
        records: included,
        excluded
      },
      null,
      2
    )}\n`
  );

  console.log(`Kept ${included.length} declassified memcons/telcons.`);
  console.log(`Excluded ${excluded.length} other records.`);
}

main();
