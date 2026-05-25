const fs = require("fs");
const path = require("path");
const { notesFromCompilerGap } = require("./frus-source-notes");

const repoRoot = path.resolve(__dirname, "..");

const paths = {
  records: path.join(repoRoot, "data", "records.json"),
  publicStatements: path.join(repoRoot, "data", "public-statements.json"),
  nscDc: path.join(repoRoot, "reports", "nsc-dc-minutes-harvest.json"),
  scout: path.join(repoRoot, "reports", "nara-scout-volume28-candidates.json"),
  chiefOfStaff: path.join(repoRoot, "reports", "chief-of-staff-harvest.json"),
  whorm: path.join(repoRoot, "reports", "whorm-harvest.json"),
  allTextual: path.join(repoRoot, "reports", "all-textual-collections-harvest.json"),
  publicHarvest: path.join(repoRoot, "reports", "public-statements-harvest.json"),
  compilerGaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  compilerGapsScript: path.join(repoRoot, "data", "compiler-gaps.js"),
  eventDossiers: path.join(repoRoot, "data", "event-dossiers.json"),
  eventDossiersScript: path.join(repoRoot, "data", "event-dossiers.js"),
  publicReview: path.join(repoRoot, "data", "public-statement-review.json"),
  publicReviewScript: path.join(repoRoot, "data", "public-statement-review.js"),
  report: path.join(repoRoot, "reports", "compiler-risk-data.json")
};

const EVENT_DEFINITIONS = [
  {
    id: "national-drug-control-strategy",
    title: "National Drug Control Strategy",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1989-1992",
    summary: "Domestic and diplomatic policy planning around the first Bush administration drug-control strategies.",
    nextAction: "Compare DPC, Chief of Staff, and presidential conversation records against the strategy release chronology.",
    terms: [/national drug control strategy/i, /\bdrug control strategy/i, /\bstrategy ii\b/i, /\bondcp\b/i]
  },
  {
    id: "cartagena-andean-drug-summit",
    title: "Cartagena and Andean Drug Summit",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1989-1990",
    summary: "Andean summit preparation, Cartagena diplomacy, and high-level talks with Colombia, Peru, and Bolivia.",
    nextAction: "Reconcile NSC/DC summit files, public statements, and presidential meetings with Barco, Paz, and Andean leaders.",
    terms: [/cartagena/i, /andean drug summit/i, /\bandean\b/i, /drug summit in colombia/i, /\bbarco\b/i, /\bgaviria\b/i]
  },
  {
    id: "san-antonio-drug-summit",
    title: "San Antonio Drug Summit",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1992",
    summary: "Summit diplomacy and White House preparation for the February 1992 San Antonio counternarcotics summit.",
    nextAction: "Treat listed but offline San Antonio folders as a mandatory pull request target before final selection.",
    terms: [/san antonio/i, /narcotics summit/i, /drug summit in san antonio/i]
  },
  {
    id: "pan-am-103-lockerbie",
    title: "Pan Am 103 and Lockerbie",
    chapter: { number: 2, name: "Counterterrorism" },
    dateRange: "1989-1992",
    summary: "Investigation, aviation security, Libya sanctions, and diplomatic handling of the Pan Am 103 bombing.",
    nextAction: "Read NSC/DC and commission files alongside declassified telcons before setting the Lockerbie chronology.",
    terms: [/pan am 103/i, /pan-am 103/i, /lockerbie/i, /aviation security/i, /libyan sanctions/i, /\blibya\b/i]
  },
  {
    id: "middle-east-hostages",
    title: "Middle East Hostages",
    chapter: { number: 2, name: "Counterterrorism" },
    dateRange: "1989-1991",
    summary: "Hostage diplomacy, detention cases, and public/private signaling in Lebanon and the broader Middle East.",
    nextAction: "Pair hostage telcons with WHORM and issue files to identify any missing non-conversation documents.",
    terms: [/hostage/i, /hostages/i, /lebanon/i, /kidnapping/i, /held captive/i]
  },
  {
    id: "noriega-panama-drug-prosecution",
    title: "Noriega, Panama, and Drug Prosecution",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1989-1992",
    summary: "Drug trafficking, extradition, and prosecution issues tied to Panama and Manuel Noriega.",
    nextAction: "Review Panama conversations and justice/legal-policy files for direct counternarcotics policy content.",
    terms: [/noriega/i, /\bpanama\b/i, /manuel noriega/i, /drug prosecution/i]
  },
  {
    id: "escobar-cartel-colombia",
    title: "Escobar, Cartels, and Colombia",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1989-1992",
    summary: "Colombian cartel violence, extradition, law enforcement aid, and diplomatic engagement with Bogota.",
    nextAction: "Use this bundle to test whether Colombia conversations need supplementation from listed policy folders.",
    terms: [/escobar/i, /cartel/i, /\bmedellin\b/i, /\bcali\b/i, /\bcolombia\b/i, /\bgaviria\b/i, /\bbarco\b/i]
  },
  {
    id: "alvarez-machain",
    title: "Alvarez-Machain and Extradition",
    chapter: { number: 1, name: "Counternarcotics" },
    dateRange: "1990-1992",
    summary: "U.S.-Mexico extradition and law-enforcement dispute surrounding the Alvarez-Machain case.",
    nextAction: "Check whether the case appears only in public/legal records or also in presidential conversation files.",
    terms: [/alvarez/i, /machain/i, /extradition/i, /\bmexico\b/i, /kidnap/i]
  }
];

const PRIORITY_PATTERNS = [
  [/san antonio/i, "High", "San Antonio summit anchor"],
  [/cartagena|andean drug summit|drug summit in colombia/i, "High", "Cartagena/Andean drug summit anchor"],
  [/national drug control strategy|strategy ii/i, "High", "National Drug Control Strategy anchor"],
  [/pan am 103|pan-am 103|lockerbie|aviation security|libyan sanctions/i, "High", "Pan Am 103/aviation security anchor"],
  [/hostage|kidnapping/i, "High", "Hostage diplomacy anchor"],
  [/noriega|escobar|cartel|colombia|gaviria|barco/i, "Medium", "Counternarcotics country or cartel anchor"],
  [/alvarez|machain|extradition/i, "Medium", "Law-enforcement/extradition anchor"]
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

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function chapterObject(chapter) {
  if (chapter?.name) return chapter;
  if (chapter === "Counterterrorism") return { number: 2, name: "Counterterrorism" };
  return { number: 1, name: "Counternarcotics" };
}

function textFor(record) {
  return [
    record.title,
    record.documentTitle,
    record.documentType,
    record.subjectLine,
    record.source?.title,
    record.source?.shortName,
    record.sourceNote,
    record.frusSourceNote,
    ...(record.matchedQueries || []),
    ...Object.values(record.topicTerms || {}).flat()
  ]
    .filter(Boolean)
    .join(" ");
}

function eventTagsFor(record) {
  const text = textFor(record);
  return EVENT_DEFINITIONS.filter((event) => event.terms.some((term) => term.test(text))).map((event) => event.id);
}

function priorityFor(record, category) {
  const text = textFor(record);
  for (const [pattern, priority] of PRIORITY_PATTERNS) {
    if (pattern.test(text)) return priority;
  }
  if (/nsc\/dc|deputies committee/i.test(category) || /chief of staff/i.test(category)) return "Medium";
  return "Review";
}

function whyFor(record, category) {
  const text = textFor(record);
  for (const [pattern, , reason] of PRIORITY_PATTERNS) {
    if (pattern.test(text)) return reason;
  }
  if (/nsc\/dc|deputies committee/i.test(category)) return "Decision-process file likely to document policy coordination.";
  if (/chief of staff/i.test(category)) return "White House senior staff policy file that may explain decision context.";
  if (/whorm/i.test(category)) return "WHORM case file may hold public/private correspondence or event logistics for chronology anchors.";
  if (/policy folder|textual/i.test(category)) return "Listed textual file may fill non-conversation policy context.";
  return "Compiler review candidate from source audit.";
}

function confidenceFor(record) {
  if (record.pdfUrl && /measured/i.test(record.pageCountBasis || "")) {
    return {
      level: "Measured online PDF",
      basis: `Page count ${record.pageCount || "not recorded"} from available PDF; access status ${record.accessRestrictionStatus || "not stated"}.`
    };
  }
  if (record.pdfUrl) {
    return {
      level: "Online PDF; Catalog listed",
      basis: `Digital object is listed; access status ${record.accessRestrictionStatus || "not stated"}.`
    };
  }
  return {
    level: "Listed/no online PDF",
    basis: record.pageCountBasis || "Catalog lists the file, but no online declassified PDF was captured."
  };
}

function categoryFor(record, reportName) {
  if (reportName === "NSC/DC") {
    return /follow/i.test(record.source?.shortName || record.source?.title || "") ? "NSC/DC follow-up file" : "NSC/DC decision file";
  }
  if (reportName === "NARA Scout") return /summit|commission|transition/i.test(textFor(record)) ? "Anchoring event file" : record.documentType || "Scout candidate";
  if (reportName === "Chief of Staff") return "Chief of Staff policy file";
  if (reportName === "WHORM") return "WHORM case file";
  if (reportName === "All textual collections") return "Policy folder";
  return record.documentType || "Compiler gap";
}

function normalizeGap(record, reportName) {
  const category = categoryFor(record, reportName);
  const chapter = chapterObject(record.chapter);
  const priority = priorityFor(record, category);
  const eventTags = eventTagsFor(record);
  const notes = notesFromCompilerGap(record);

  return {
    id: `gap-${record.naid || slug(record.title)}`,
    naid: record.naid || "",
    title: record.documentTitle || record.title || "",
    date: record.date || record.sortDate || "",
    sortDate: record.sortDate || record.date || "",
    chapter,
    category,
    documentType: record.documentType || category,
    sourceName: record.source?.shortName || record.source?.title || reportName,
    sourceCollection: notes.sourceCollection || "",
    sourceFolder: notes.sourceFolder || "",
    priority,
    eventTags,
    catalogUrl: record.catalogUrl || (record.naid ? `https://catalog.archives.gov/id/${record.naid}` : ""),
    pdfUrl: record.pdfUrl || "",
    pageCount: record.pageCount || null,
    pageCountBasis: record.pageCountBasis || "",
    localIdentifier: record.localIdentifier || "",
    containerId: record.containerId || "",
    releaseStatus: record.releaseStatus || "",
    accessRestrictionStatus: record.accessRestrictionStatus || "",
    sourceNote: notes.sourceNote,
    frusSourceNote: notes.sourceNote,
    catalogTrail: notes.catalogTrail,
    matchedQueries: record.matchedQueries || [],
    sourceConfidence: confidenceFor(record),
    why: whyFor(record, category),
    sourceReports: [reportName]
  };
}

function buildCompilerGaps(records, reports) {
  const publishedNaids = new Set(records.map((record) => String(record.naid)).filter(Boolean));
  const byNaid = new Map();

  for (const { name, records: reportRecords } of reports) {
    for (const record of reportRecords) {
      if (!record?.naid || publishedNaids.has(String(record.naid))) continue;
      const normalized = normalizeGap(record, name);
      const existing = byNaid.get(normalized.naid);
      if (existing) {
        existing.sourceReports = [...new Set([...existing.sourceReports, name])];
        existing.matchedQueries = [...new Set([...(existing.matchedQueries || []), ...(normalized.matchedQueries || [])])];
        if (!existing.pdfUrl && normalized.pdfUrl) existing.pdfUrl = normalized.pdfUrl;
        if (!existing.pageCount && normalized.pageCount) existing.pageCount = normalized.pageCount;
        if (!existing.eventTags.length && normalized.eventTags.length) existing.eventTags = normalized.eventTags;
      } else {
        byNaid.set(normalized.naid, normalized);
      }
    }
  }

  return [...byNaid.values()].sort((a, b) => {
    const priorityOrder = { High: 0, Medium: 1, Review: 2 };
    return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
      || a.chapter.number - b.chapter.number
      || String(a.sortDate).localeCompare(String(b.sortDate))
      || a.title.localeCompare(b.title);
  });
}

function pageRange(start, end) {
  if (!start) return "";
  if (!end || start === end) return `p. ${start}`;
  return `pp. ${start}-${end}`;
}

function buildPublicReview(publicHarvest) {
  const packages = new Map((publicHarvest.packages || []).map((pkg) => [pkg.packageId, pkg]));
  return (publicHarvest.passingMentions || []).map((mention, index) => {
    const pkg = packages.get(mention.packageId) || {};
    const range = pageRange(mention.printedPageStart, mention.printedPageEnd);
    const citation = `Public Papers: Bush, ${pkg.citationYear || mention.date?.slice(0, 4) || ""}, ${pkg.volumeLabel || mention.packageId}, ${range}.`;
    const govinfoUrl = `https://www.govinfo.gov/app/details/${mention.packageId}`;
    const pdfUrl = `https://www.govinfo.gov/content/pkg/${mention.packageId}/pdf/${mention.packageId}.pdf`;
    const chapter = chapterObject(mention.chapter);

    return {
      id: `public-review-${mention.packageId}-${mention.printedPageStart || index}-${slug(mention.title)}`,
      title: mention.title || "",
      date: mention.date || "",
      sortDate: mention.date || "",
      year: mention.date?.slice(0, 4) || "",
      chapter,
      packageId: mention.packageId,
      packageLabel: `Public Papers: Bush, ${pkg.citationYear || ""}, ${pkg.volumeLabel || ""}`.replace(/,\s*$/, ""),
      volumeDateSpan: pkg.dateSpan || "",
      printedPageStart: mention.printedPageStart || null,
      printedPageEnd: mention.printedPageEnd || null,
      pageRange: range,
      citation,
      sourceNote: citation,
      govinfoUrl,
      pdfUrl,
      matchedTerms: mention.matchedTerms || [],
      compilerUse: "Passing keyword mention excluded from promoted reference list; review only if it fills a chronology gap or documents public positioning for a major event."
    };
  }).sort((a, b) => a.chapter.number - b.chapter.number || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function slimRecord(record) {
  return {
    id: record.id,
    naid: record.naid || "",
    title: record.documentTitle || record.title || "",
    date: record.date || record.sortDate || "",
    documentType: record.documentType || "",
    chapter: chapterObject(record.chapter),
    pageCount: record.pageCount || null,
    priority: record.priority || "",
    category: record.category || "",
    accessRestrictionStatus: record.accessRestrictionStatus || "",
    catalogUrl: record.catalogUrl || "",
    pdfUrl: record.pdfUrl || "",
    sourceName: record.sourceName || record.source?.shortName || record.source?.title || "",
    sourceNote: record.frusSourceNote || record.sourceNote || record.citation || ""
  };
}

function textForPublic(statement) {
  return [
    statement.title,
    statement.documentType,
    statement.publicVoice,
    statement.relevance,
    statement.compilerUse,
    statement.citation,
    ...(statement.matchedTerms?.[statement.chapter?.name] || []).map((term) => term.label),
    ...(Array.isArray(statement.matchedTerms) ? statement.matchedTerms.map((term) => term.label) : [])
  ]
    .filter(Boolean)
    .join(" ");
}

function eventMatches(record, event) {
  return event.terms.some((term) => term.test(textFor(record)));
}

function publicEventMatches(statement, event) {
  return event.terms.some((term) => term.test(textForPublic(statement)));
}

function buildEventDossiers(records, compilerGaps, publicStatements, publicReview) {
  return EVENT_DEFINITIONS.map((event) => {
    const privateMatches = records.filter((record) => eventMatches(record, event));
    const gapMatches = compilerGaps.filter((record) => record.eventTags?.includes(event.id) || eventMatches(record, event));
    const promotedMatches = publicStatements.filter((statement) => publicEventMatches(statement, event));
    const reviewMatches = publicReview.filter((statement) => publicEventMatches(statement, event));

    return {
      id: event.id,
      title: event.title,
      chapter: event.chapter,
      dateRange: event.dateRange,
      summary: event.summary,
      nextAction: event.nextAction,
      counts: {
        declassifiedConversations: privateMatches.length,
        compilerGaps: gapMatches.length,
        publicStatements: promotedMatches.length,
        publicReviewMentions: reviewMatches.length
      },
      privateRecords: privateMatches.sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate))).slice(0, 10).map(slimRecord),
      gapRecords: gapMatches.slice(0, 12).map(slimRecord),
      publicStatements: promotedMatches.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8).map(slimRecord),
      publicReviewMentions: reviewMatches.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8).map(slimRecord)
    };
  });
}

function countBy(records, selector) {
  return records.reduce((counts, record) => {
    const key = selector(record) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function main() {
  const records = readJson(paths.records);
  const publicStatements = readJson(paths.publicStatements);
  const nscDc = readJson(paths.nscDc);
  const scout = readJson(paths.scout);
  const chiefOfStaff = readJson(paths.chiefOfStaff);
  const whorm = readJson(paths.whorm);
  const allTextual = readJson(paths.allTextual);
  const publicHarvest = readJson(paths.publicHarvest);

  const compilerGaps = buildCompilerGaps(records, [
    { name: "NSC/DC", records: nscDc.records || [] },
    { name: "NARA Scout", records: scout.candidates || [] },
    { name: "Chief of Staff", records: chiefOfStaff.records || [] },
    { name: "WHORM", records: whorm.records || [] },
    { name: "All textual collections", records: allTextual.records || [] }
  ]);
  const publicReview = buildPublicReview(publicHarvest);
  const eventDossiers = buildEventDossiers(records, compilerGaps, publicStatements, publicReview);

  writeJsonAndScript(paths.compilerGaps, paths.compilerGapsScript, "FRUS_COMPILER_GAPS", compilerGaps);
  writeJsonAndScript(paths.publicReview, paths.publicReviewScript, "BUSH_PUBLIC_STATEMENT_REVIEW", publicReview);
  writeJsonAndScript(paths.eventDossiers, paths.eventDossiersScript, "FRUS_EVENT_DOSSIERS", eventDossiers);

  fs.writeFileSync(
    paths.report,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        publishedConversationRecords: records.length,
        compilerGaps: compilerGaps.length,
        publicReviewMentions: publicReview.length,
        eventDossiers: eventDossiers.length,
        gapCountsByCategory: countBy(compilerGaps, (record) => record.category),
        gapCountsByPriority: countBy(compilerGaps, (record) => record.priority),
        gapCountsByConfidence: countBy(compilerGaps, (record) => record.sourceConfidence?.level),
        eventCounts: Object.fromEntries(eventDossiers.map((event) => [event.id, event.counts]))
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${compilerGaps.length} compiler gaps`);
  console.log(`Wrote ${eventDossiers.length} event dossiers`);
  console.log(`Wrote ${publicReview.length} public statement review mentions`);
}

main();
