const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function write(relativePath, content) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function countByNaid(records, naid) {
  return (records || []).filter((record) => String(record.source?.naid || record.seriesNaid || record.collectionNaid) === String(naid)).length;
}

function allTextualRows(report, naid) {
  return (report.reviewed || []).filter((record) =>
    [record.collectionNaid, record.seriesNaid].map(String).includes(String(naid))
  );
}

function evidence(label, path) {
  return { label, path };
}

function main() {
  const conversations = read("reports/presidential-conversation-harvest.json");
  const records = read("data/records.json");
  const dailyDiary = read("reports/daily-diary-references-harvest.json");
  const nscDc = read("reports/nsc-dc-minutes-harvest.json");
  const whorm = read("reports/whorm-harvest.json");
  const chiefOfStaff = read("reports/chief-of-staff-harvest.json");
  const allTextual = read("reports/all-textual-collections-harvest.json");
  const scout = read("reports/nara-scout-terrorism-narcotics-raw.json");
  const scoutCandidates = read("reports/nara-scout-volume28-candidates.json");
  const priorityPolicy = read("reports/priority-policy-files-harvest.json");
  const publicStatements = read("reports/public-statements-harvest.json");

  const priorityBySeries = (naid) => countByNaid(priorityPolicy.records, naid);
  const directBySeries = (naid) => countByNaid(nscDc.records, naid);
  const retainedByAllTextualSeries = (naid) => countByNaid(allTextual.records, naid);
  const allTextualStats = (naid) => {
    const reviewed = allTextualRows(allTextual, naid);
    return {
      reviewed: reviewed.length,
      selected: reviewed.filter((record) => record.selected).length,
      priority: reviewed.filter((record) => record.prioritySelected).length,
      online: reviewed.filter((record) => record.online).length
    };
  };

  const scowcroft = allTextualStats("4522156");
  const nscMeetings = allTextualStats("312293887");
  const dcMeetings = allTextualStats("312294079");
  const dcFollowUp = allTextualStats("312294094");
  const nsr = allTextualStats("313189297");
  const nsd = allTextualStats("313189290");
  const transition = allTextualStats("348937136");

  const rows = [
    {
      id: "presidential-memcons",
      name: "Presidential Memcon Files",
      kind: "Core chronology",
      status: "Direct corpus",
      naid: "321498039",
      sourceUrl: "https://catalog.archives.gov/id/321498039",
      lastRun: conversations.generatedAt,
      reviewed: records.filter((record) => record.documentType === "Memcon").length,
      retained: records.filter((record) => record.documentType === "Memcon").length,
      online: records.filter((record) => record.documentType === "Memcon" && record.pdfUrl).length,
      method: "Direct item-level sweep of the Presidential Memcon Files using the chapter topic vocabulary.",
      outcome: "Every retained record is an online presidential memorandum of conversation in the declassified chronology.",
      evidence: [evidence("Conversation harvest", "reports/presidential-conversation-harvest.json")]
    },
    {
      id: "presidential-telcons",
      name: "Presidential Telcon Files",
      kind: "Core chronology",
      status: "Direct corpus",
      naid: "321498139",
      sourceUrl: "https://catalog.archives.gov/id/321498139",
      lastRun: conversations.generatedAt,
      reviewed: records.filter((record) => record.documentType === "Telcon").length,
      retained: records.filter((record) => record.documentType === "Telcon").length,
      online: records.filter((record) => record.documentType === "Telcon" && record.pdfUrl).length,
      method: "Direct item-level sweep of the Presidential Telcon Files using the chapter topic vocabulary.",
      outcome: "Every retained record is an online presidential telephone conversation in the declassified chronology.",
      evidence: [evidence("Conversation harvest", "reports/presidential-conversation-harvest.json")]
    },
    {
      id: "daily-diary",
      name: "Presidential Daily Diary and Daily Backup Materials",
      kind: "Schedule control",
      status: "Direct corpus",
      naid: "186322",
      sourceUrl: "https://catalog.archives.gov/id/186322",
      lastRun: dailyDiary.generatedAt,
      reviewed: dailyDiary.uniqueRecordDates,
      retained: dailyDiary.scheduleReferenceCount,
      online: dailyDiary.scheduleReferenceCount,
      method: "Exact-date Catalog checks for each unique memcon and telcon date.",
      outcome: `${dailyDiary.recordsWithScheduleReferences} conversations have same-day Diary or Daily Backup control references; ${dailyDiary.recordsWithoutScheduleReferences} lack a control.`,
      evidence: [evidence("Daily Diary audit", "reports/daily-diary-references-harvest.json")]
    },
    {
      id: "scowcroft-papers",
      name: "Brent Scowcroft Papers",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "4522156",
      sourceUrl: "https://catalog.archives.gov/id/4522156",
      lastRun: priorityPolicy.generatedAt,
      reviewed: scowcroft.reviewed,
      retained: priorityPolicy.records.filter((record) => /Scowcroft/i.test(record.documentType)).length,
      online: priorityPolicy.records.filter((record) => /Scowcroft/i.test(record.documentType) && record.pdfUrl).length,
      method: "Full textual-index topic sweep followed by a focused review of direct-title Latin America--Drug War folders.",
      outcome: "Five online Drug War folders are now high-priority compiler risks with measured page counts and OA/ID controls.",
      evidence: [
        evidence("Priority policy audit", "reports/priority-policy-files-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "nsc-meetings",
      name: "H-Files - NSC Meeting Files",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "312293887",
      sourceUrl: "https://catalog.archives.gov/id/312293887",
      lastRun: nscDc.generatedAt,
      reviewed: Math.max(nscMeetings.reviewed, directBySeries("312293887")),
      retained: retainedByAllTextualSeries("312293887"),
      online: (allTextual.records || []).filter((record) => String(record.source?.naid) === "312293887" && record.pdfUrl).length,
      method: "Direct NSC minutes search plus the all-textual title audit.",
      outcome: "Relevant NSC meeting files are preserved in the pull/explain queue, with measured pages when an online PDF exists.",
      evidence: [
        evidence("NSC/DC minutes audit", "reports/nsc-dc-minutes-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "dc-meetings",
      name: "H-Files - NSC/Deputies Committee Meetings",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "312294079",
      sourceUrl: "https://catalog.archives.gov/id/312294079",
      lastRun: nscDc.generatedAt,
      reviewed: Math.max(dcMeetings.reviewed, directBySeries("312294079")),
      retained: directBySeries("312294079"),
      online: (nscDc.records || []).filter((record) => String(record.source?.naid) === "312294079" && record.pdfUrl).length,
      method: "Direct Deputies Committee minutes search plus the all-textual title audit.",
      outcome: "Listed minutes remain visible even when not fully declassified; measured or series-based page counts are carried into the risk queue.",
      evidence: [
        evidence("NSC/DC minutes audit", "reports/nsc-dc-minutes-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "dc-follow-up",
      name: "H-Files - NSC/Deputies Committee Follow-Up",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "312294094",
      sourceUrl: "https://catalog.archives.gov/id/312294094",
      lastRun: nscDc.generatedAt,
      reviewed: Math.max(dcFollowUp.reviewed, directBySeries("312294094")),
      retained: directBySeries("312294094"),
      online: (nscDc.records || []).filter((record) => String(record.source?.naid) === "312294094" && record.pdfUrl).length,
      method: "Direct follow-up-file search plus the all-textual title audit.",
      outcome: "Follow-up files are kept as decision-process evidence rather than folded into the declassified conversation chronology.",
      evidence: [
        evidence("NSC/DC minutes audit", "reports/nsc-dc-minutes-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "nsr-files",
      name: "H-Files - National Security Review Files",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "313189297",
      sourceUrl: "https://catalog.archives.gov/id/313189297",
      lastRun: priorityPolicy.generatedAt,
      reviewed: nsr.reviewed,
      retained: priorityBySeries("313189297"),
      online: priorityPolicy.records.filter((record) => String(record.source?.naid) === "313189297" && record.pdfUrl).length,
      method: "All-textual title sweep with direct PDF verification of NSR-13.",
      outcome: "NSR-13, the National Security Review of International Counternarcotics Activities, is a measured online pull target.",
      evidence: [
        evidence("Priority policy audit", "reports/priority-policy-files-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "nsd-files",
      name: "H-Files - National Security Directive Files",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "313189290",
      sourceUrl: "https://catalog.archives.gov/id/313189290",
      lastRun: priorityPolicy.generatedAt,
      reviewed: nsd.reviewed,
      retained: priorityBySeries("313189290"),
      online: priorityPolicy.records.filter((record) => String(record.source?.naid) === "313189290" && record.pdfUrl).length,
      method: "All-textual title sweep with direct PDF verification of NSD-13 and NSD-18.",
      outcome: "Both Cocaine Trafficking and International Counternarcotics Strategy directive files are measured online pull targets.",
      evidence: [
        evidence("Priority policy audit", "reports/priority-policy-files-harvest.json"),
        evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")
      ]
    },
    {
      id: "transition-files",
      name: "Institutional Files - Transition Files",
      kind: "Policy and decision files",
      status: "Collection-wide sweep",
      naid: "348937136",
      sourceUrl: "https://catalog.archives.gov/id/348937136",
      lastRun: allTextual.generatedAt,
      reviewed: transition.reviewed,
      retained: transition.priority,
      online: transition.online,
      method: "Complete Bush Library textual-index topic sweep.",
      outcome: "Two keyword-bearing transition files were reviewed; neither had a direct Volume XXVIII title signal.",
      evidence: [evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")]
    },
    {
      id: "whorm",
      name: "White House Office of Records Management",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "564645",
      sourceUrl: "https://catalog.archives.gov/id/564645",
      lastRun: whorm.generatedAt,
      reviewed: whorm.reviewedTargetSeriesRecords,
      retained: whorm.selectedRecords,
      online: (whorm.records || []).filter((record) => record.pdfUrl).length,
      method: "Focused sweep of Drug Summit, ONDCP, Narcotics, and Kidnapping/Hostages subject series.",
      outcome: "Target-series cases are preserved as event and policy pull targets; generic correspondence hits remain in the audit report.",
      evidence: [evidence("WHORM audit", "reports/whorm-harvest.json")]
    },
    {
      id: "chief-of-staff",
      name: "White House Office of the Chief of Staff",
      kind: "Policy and decision files",
      status: "Focused audit",
      naid: "580456",
      sourceUrl: "https://catalog.archives.gov/id/580456",
      lastRun: chiefOfStaff.generatedAt,
      reviewed: chiefOfStaff.reviewedTargetRecords,
      retained: chiefOfStaff.selectedRecords,
      online: (chiefOfStaff.records || []).filter((record) => record.pdfUrl).length,
      method: "Focused review of direct-title drug strategy, Drug Czar, senior policy, and Pan Am 103 Commission files.",
      outcome: "Senior staff policy files are retained in the compiler risk queue with lower-value correspondence left in the report.",
      evidence: [evidence("Chief of Staff audit", "reports/chief-of-staff-harvest.json")]
    },
    {
      id: "all-textual",
      name: "Bush Library All Textual Collections",
      kind: "Cross-collection audit",
      status: "Collection-wide sweep",
      naid: "",
      sourceUrl: allTextual.sourcePage,
      lastRun: allTextual.generatedAt,
      reviewed: allTextual.reviewedRecords,
      retained: allTextual.selectedRecordsAdded,
      online: allTextual.measuredRecords,
      method: `${allTextual.topicQueries.length} topic queries across ${allTextual.collectionCount} listed textual collections.`,
      outcome: "The broad audit preserves excluded and lower-priority hits so the narrower compiler queue remains explainable.",
      evidence: [evidence("All textual collections audit", "reports/all-textual-collections-harvest.json")]
    },
    {
      id: "nara-scout",
      name: "NARA Scout Bush 41 Cross-Collection Search",
      kind: "Cross-collection audit",
      status: "Discovery overlay",
      naid: "",
      sourceUrl: scout.sourceUrl,
      lastRun: scout.generatedAt,
      reviewed: scout.uniqueRecords,
      retained: scoutCandidates.candidatesForVolume28,
      online: scoutCandidates.onlinePdfRecords,
      method: `Terrorism OR narcotics across ${scout.collectionCount} Bush 41 collections, capped at ${scout.perCollectionLimit} records per collection.`,
      outcome: "The Scout result is a discovery overlay; direct collection audits supersede its per-collection cap for final coverage claims.",
      evidence: [
        evidence("NARA Scout raw audit", "reports/nara-scout-terrorism-narcotics-raw.json"),
        evidence("NARA Scout compiler review", "reports/nara-scout-volume28-candidates.json")
      ]
    },
    {
      id: "public-papers",
      name: "Public Papers of President George H.W. Bush",
      kind: "Public reference",
      status: "Reference corpus",
      naid: "",
      sourceUrl: "https://www.govinfo.gov/app/collection/ppp/president-41_Bush%2C%20George%20H.%20W.",
      lastRun: publicStatements.generatedAt,
      reviewed: publicStatements.totals.entriesParsed,
      retained: publicStatements.totals.promotedReferences,
      online: publicStatements.totals.promotedReferences,
      method: "Full-text parsing of all eight GovInfo Public Papers volumes for 1989-1993.",
      outcome: `${publicStatements.totals.promotedReferences} substantive references are published; ${publicStatements.totals.passingMentionsExcluded} passing mentions remain separately reviewable.`,
      evidence: [evidence("Public Papers audit", "reports/public-statements-harvest.json")]
    }
  ];

  const generatedAt = new Date().toISOString();
  const json = JSON.stringify(rows, null, 2);
  write("data/collection-coverage.json", `${json}\n`);
  write("data/collection-coverage.js", `window.FRUS_COLLECTION_COVERAGE = ${json};\n`);
  write("reports/collection-coverage-build.json", `${JSON.stringify({
    generatedAt,
    collectionRows: rows.length,
    statusCounts: rows.reduce((counts, row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    }, {}),
    sourceKinds: rows.reduce((counts, row) => {
      counts[row.kind] = (counts[row.kind] || 0) + 1;
      return counts;
    }, {})
  }, null, 2)}\n`);
  console.log(`Wrote ${rows.length} collection coverage rows.`);
}

main();
