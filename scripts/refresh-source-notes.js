const fs = require("fs");
const path = require("path");
const { notesFromSiteRecord, notesFromCompilerGap } = require("./frus-source-notes");

const repoRoot = path.resolve(__dirname, "..");
const paths = {
  records: path.join(repoRoot, "data", "records.json"),
  recordsScript: path.join(repoRoot, "data", "records.js"),
  presidentialReport: path.join(repoRoot, "reports", "presidential-conversation-harvest.json"),
  compilerGaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  compilerGapsScript: path.join(repoRoot, "data", "compiler-gaps.js"),
  eventDossiers: path.join(repoRoot, "data", "event-dossiers.json"),
  eventDossiersScript: path.join(repoRoot, "data", "event-dossiers.js"),
  report: path.join(repoRoot, "reports", "source-notes-refresh.json")
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAndScript(jsonPath, scriptPath, globalName, data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(jsonPath, `${json}\n`);
  fs.writeFileSync(scriptPath, `window.${globalName} = ${json};\n`);
}

function legacyConversationMap() {
  if (!fs.existsSync(paths.presidentialReport)) return new Map();
  const report = readJson(paths.presidentialReport);
  return new Map((report.records || []).map((record) => [String(record.naid), record]));
}

function refreshRecord(record, legacyByNaid) {
  const legacy = legacyByNaid.get(String(record.naid));
  const notes = notesFromSiteRecord(legacy ? { ...record, sourceNote: legacy.sourceNote, source: legacy.source || record.source } : record);
  return {
    ...record,
    sourceNote: notes.sourceNote,
    frusSourceNote: notes.sourceNote,
    sourceCollection: notes.sourceCollection,
    sourceFolder: notes.sourceFolder,
    catalogTrail: notes.catalogTrail
  };
}

function refreshGap(record) {
  const notes = notesFromCompilerGap(record);
  return {
    ...record,
    sourceNote: notes.sourceNote,
    frusSourceNote: notes.sourceNote,
    sourceCollection: notes.sourceCollection,
    sourceFolder: notes.sourceFolder,
    catalogTrail: notes.catalogTrail
  };
}

function refreshDossierRecords(dossiers, refreshedById) {
  return dossiers.map((dossier) => ({
    ...dossier,
    privateRecords: (dossier.privateRecords || []).map((record) => {
      const refreshed = refreshedById.get(record.id);
      return refreshed ? { ...record, sourceNote: refreshed.frusSourceNote || refreshed.sourceNote } : record;
    }),
    gapRecords: (dossier.gapRecords || []).map((record) => {
      const refreshed = refreshedById.get(record.id);
      return refreshed ? { ...record, sourceNote: refreshed.frusSourceNote || refreshed.sourceNote } : record;
    })
  }));
}

function main() {
  const legacyByNaid = legacyConversationMap();
  const records = readJson(paths.records).map((record) => refreshRecord(record, legacyByNaid));
  const gaps = readJson(paths.compilerGaps).map(refreshGap);
  const dossiers = readJson(paths.eventDossiers);
  const refreshedById = new Map([...records, ...gaps].map((record) => [record.id, record]));
  const refreshedDossiers = refreshDossierRecords(dossiers, refreshedById);

  writeJsonAndScript(paths.records, paths.recordsScript, "FRUS_RECORDS", records);
  writeJsonAndScript(paths.compilerGaps, paths.compilerGapsScript, "FRUS_COMPILER_GAPS", gaps);
  writeJsonAndScript(paths.eventDossiers, paths.eventDossiersScript, "FRUS_EVENT_DOSSIERS", refreshedDossiers);

  fs.writeFileSync(
    paths.report,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recordsRefreshed: records.length,
        compilerGapsRefreshed: gaps.length,
        eventDossiersRefreshed: refreshedDossiers.length,
        recordClassificationCoverage: records.filter((record) => record.pdfExtract?.classificationMarking).length,
        catalogTrailCoverage: {
          records: records.filter((record) => record.catalogTrail).length,
          compilerGaps: gaps.filter((record) => record.catalogTrail).length
        }
      },
      null,
      2
    )}\n`
  );
}

main();
