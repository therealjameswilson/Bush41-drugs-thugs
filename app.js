const CHAPTER_ORDER = ["Counternarcotics", "Counterterrorism"];
const REVIEW_STORAGE_KEY = "frus-v28-reviewed-records";

const recordsRoot = document.querySelector("#records-root");
const totalRecords = document.querySelector("#total-records");
const totalPdfs = document.querySelector("#total-pdfs");
const totalReviewed = document.querySelector("#total-reviewed");
const totalPublicStatements = document.querySelector("#total-public-statements");
const totalPersons = document.querySelector("#total-persons");
const totalEventDossiers = document.querySelector("#total-event-dossiers");
const totalCompilerGaps = document.querySelector("#total-compiler-gaps");
const totalScheduleReferences = document.querySelector("#total-schedule-references");
const filteredCount = document.querySelector("#filtered-count");
const searchInput = document.querySelector("#filter-search");
const chapterFilter = document.querySelector("#filter-chapter");
const typeFilter = document.querySelector("#filter-type");
const yearFilter = document.querySelector("#filter-year");
const sourceFilter = document.querySelector("#filter-source");
const confidenceFilter = document.querySelector("#filter-confidence");
const reviewFilter = document.querySelector("#filter-review");
const sortSelect = document.querySelector("#sort-records");
const resetButton = document.querySelector("#reset-filters");
const exportButton = document.querySelector("#export-csv");
const packetExportButton = document.querySelector("#export-packet");
const publicStatementsRoot = document.querySelector("#public-statements-root");
const referenceCount = document.querySelector("#reference-count");
const referenceSearchInput = document.querySelector("#reference-search");
const referenceChapterFilter = document.querySelector("#reference-chapter");
const referenceYearFilter = document.querySelector("#reference-year");
const referenceTypeFilter = document.querySelector("#reference-type");
const referenceVoiceFilter = document.querySelector("#reference-voice");
const referenceRelevanceFilter = document.querySelector("#reference-relevance");
const referenceSortSelect = document.querySelector("#sort-references");
const referenceResetButton = document.querySelector("#reset-references");
const referenceExportButton = document.querySelector("#export-references-csv");
const personsRoot = document.querySelector("#persons-root");
const personCount = document.querySelector("#person-count");
const personSearchInput = document.querySelector("#person-search");
const personChapterFilter = document.querySelector("#person-chapter");
const personSourceFilter = document.querySelector("#person-source");
const personSortSelect = document.querySelector("#sort-persons");
const personResetButton = document.querySelector("#reset-persons");
const personExportButton = document.querySelector("#export-persons-csv");
const eventDossiersRoot = document.querySelector("#event-dossiers-root");
const compilerGapsRoot = document.querySelector("#compiler-gaps-root");
const gapCount = document.querySelector("#gap-count");
const gapSearchInput = document.querySelector("#gap-search");
const gapChapterFilter = document.querySelector("#gap-chapter");
const gapCategoryFilter = document.querySelector("#gap-category");
const gapPriorityFilter = document.querySelector("#gap-priority");
const gapConfidenceFilter = document.querySelector("#gap-confidence");
const gapSortSelect = document.querySelector("#sort-gaps");
const gapResetButton = document.querySelector("#reset-gaps");
const gapExportButton = document.querySelector("#export-gaps-csv");
const publicMentionsRoot = document.querySelector("#public-mentions-root");
const mentionCount = document.querySelector("#mention-count");
const mentionSearchInput = document.querySelector("#mention-search");
const mentionChapterFilter = document.querySelector("#mention-chapter");
const mentionYearFilter = document.querySelector("#mention-year");
const mentionPackageFilter = document.querySelector("#mention-package");
const mentionSortSelect = document.querySelector("#sort-mentions");
const mentionResetButton = document.querySelector("#reset-mentions");
const mentionExportButton = document.querySelector("#export-mentions-csv");

const TOPIC_SIGNALS = [
  { label: "Drug summit", pattern: /\b(drug summit|cartagena|san antonio summit)\b/i, weight: 4 },
  { label: "Counternarcotics", pattern: /\b(counter[-\s]?narcotics|narcotics|drug control|drug trafficking|andes|andean)\b/i, weight: 3 },
  { label: "Colombia / Peru / Bolivia", pattern: /\b(colombia|barco|gaviria|peru|garcia|fujimori|bolivia|estenssoro|paz zamora)\b/i, weight: 2 },
  { label: "Terrorism", pattern: /\b(counter[-\s]?terrorism|terrorism|terrorist|terrorists)\b/i, weight: 3 },
  { label: "Lockerbie / Pan Am 103", pattern: /\b(lockerbie|pan am|pan-am|aviation security)\b/i, weight: 4 },
  { label: "Hostages", pattern: /\b(hostage|hostages|hostage-taking)\b/i, weight: 3 },
  { label: "Libya / Middle East terror", pattern: /\b(libya|qadhafi|gaddafi|abu nidal|pflugerville|extradition)\b/i, weight: 2 }
];

let allRecords = [];
let visibleRecords = [];
let allPublicStatements = [];
let visiblePublicStatements = [];
let allPersons = [];
let visiblePersons = [];
let allEventDossiers = [];
let allCompilerGaps = [];
let visibleCompilerGaps = [];
let allPublicReviewMentions = [];
let visiblePublicReviewMentions = [];
let allScheduleReferences = [];
let reviewedRecords = new Set(readReviewedRecords());

function chapterId(chapterName) {
  return `chapter-${chapterName.toLowerCase().replaceAll(" ", "-")}`;
}

function shortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function readReviewedRecords() {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReviewedRecords() {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify([...reviewedRecords]));
}

function getTerms(record) {
  return [
    ...(record.topicTerms?.[record.chapter?.name] || []),
    ...(record.matchedQueries || [])
  ].filter(Boolean);
}

function frusSourceNote(record) {
  return record.frusSourceNote || record.sourceNote || "FRUS-style source note pending.";
}

function catalogTrail(record) {
  return record.catalogTrail || record.sourceNote || "";
}

function scheduleReferences(record) {
  return record.scheduleReferences || [];
}

function scheduleReferenceSummary(record) {
  return scheduleReferences(record)
    .map((reference) => {
      const empty = reference.isEmptyDiary && !/\[EMPTY\]/i.test(reference.title) ? " [empty diary file]" : "";
      return `${reference.documentType}: ${reference.title}${empty}${reference.catalogUrl ? ` (${reference.catalogUrl})` : ""}`;
    })
    .join("; ");
}

function scheduleReferenceSourceNotes(record) {
  return scheduleReferences(record).map((reference) => reference.sourceNote).filter(Boolean).join(" | ");
}

function searchableText(record) {
  return [
    record.naid,
    record.title,
    record.documentTitle,
    record.documentType,
    record.subjectLine,
    record.dateLine,
    record.localIdentifier,
    record.source?.title,
    record.source?.shortName,
    frusSourceNote(record),
    catalogTrail(record),
    record.scheduleReferenceSummary,
    scheduleReferences(record).map((reference) => [
      reference.title,
      reference.documentType,
      reference.naid,
      reference.localIdentifier,
      reference.sourceNote,
      reference.catalogTrail,
      reference.matchBasis
    ].filter(Boolean).join(" ")).join(" "),
    record.objectFilename,
    getTerms(record).join(" "),
    record.pdfExtract?.subject,
    record.pdfExtract?.participants,
    record.pdfExtract?.dateTimePlace,
    record.pdfExtract?.classificationMarking,
    record.sourceConfidence?.level,
    record.sourceConfidence?.basis
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function eventTitle(eventId) {
  return allEventDossiers.find((event) => event.id === eventId)?.title || eventId.replaceAll("-", " ");
}

function statementTerms(statement, chapterName = statement.chapter?.name) {
  return (statement.matchedTerms?.[chapterName] || []).map((term) => {
    if (!term?.label) return "";
    return term.count > 1 ? `${term.label} (${term.count})` : term.label;
  }).filter(Boolean);
}

function statementSearchableText(statement) {
  return [
    statement.title,
    statement.date,
    statement.dateText,
    statement.chapter?.name,
    statement.documentType,
    statement.publicVoice,
    statement.relevance,
    statement.citation,
    statement.sourceNote,
    statement.source?.shortName,
    statement.source?.packageId,
    statement.compilerUse,
    statementTerms(statement).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function uniqueValues(records, selector) {
  return [...new Set(records.map(selector).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function signalMatches(record) {
  const text = searchableText(record);
  return TOPIC_SIGNALS.filter((signal) => signal.pattern.test(text));
}

function confidence(record) {
  const signals = signalMatches(record);
  const signalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const termScore = new Set(getTerms(record).map((term) => term.toLowerCase())).size;
  const score = signalScore + termScore;

  if (score >= 8 || signals.some((signal) => signal.weight === 4)) {
    return { value: "strong", label: "Strong topic hit", score };
  }

  if (score >= 4 || termScore >= 2) {
    return { value: "solid", label: "Solid topic hit", score };
  }

  return { value: "review", label: "Needs review", score };
}

function byChapterThenDate(a, b) {
  return a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title);
}

function byDate(a, b) {
  return a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title);
}

function byConfidence(a, b) {
  return confidence(b).score - confidence(a).score || byChapterThenDate(a, b);
}

function sortRecords(records) {
  const sorted = [...records];
  const sortMode = sortSelect?.value || "chapter-date";

  if (sortMode === "date") return sorted.sort(byDate);
  if (sortMode === "confidence") return sorted.sort(byConfidence);
  if (sortMode === "type") {
    return sorted.sort((a, b) => a.documentType.localeCompare(b.documentType) || byChapterThenDate(a, b));
  }

  return sorted.sort(byChapterThenDate);
}

function setOptions(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  const options = [new Option(allLabel, "")];
  for (const value of values) options.push(new Option(value, value));
  select.replaceChildren(...options);
  if (values.includes(current)) select.value = current;
}

function setWorkbenchOptions(records) {
  setOptions(yearFilter, uniqueValues(records, (record) => record.date?.slice(0, 4)), "All years");
  setOptions(typeFilter, uniqueValues(records, (record) => record.documentType), "All types");
  setOptions(sourceFilter, uniqueValues(records, (record) => record.source?.shortName), "All source series");
}

function setReferenceOptions(statements) {
  setOptions(referenceYearFilter, uniqueValues(statements, (statement) => statement.year), "All years");
  setOptions(referenceTypeFilter, uniqueValues(statements, (statement) => statement.documentType), "All types");
  setOptions(referenceVoiceFilter, uniqueValues(statements, (statement) => statement.publicVoice), "All public entries");
}

function setPersonOptions(persons) {
  setOptions(personSourceFilter, [...new Set(persons.flatMap((person) => person.sourceTypes || []))].sort(), "All source bases");
}

function setGapOptions(records) {
  setOptions(gapCategoryFilter, uniqueValues(records, (record) => record.category), "All categories");
  setOptions(gapConfidenceFilter, uniqueValues(records, (record) => record.sourceConfidence?.level), "All source states");
}

function setMentionOptions(mentions) {
  setOptions(mentionYearFilter, uniqueValues(mentions, (mention) => mention.year), "All years");
  setOptions(mentionPackageFilter, uniqueValues(mentions, (mention) => mention.packageId), "All volumes");
}

function setChapterCounts(records) {
  totalRecords.textContent = records.length.toString();
  totalPdfs.textContent = records.filter((record) => record.pdfUrl).length.toString();
  totalReviewed.textContent = records.filter((record) => reviewedRecords.has(record.id)).length.toString();

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    const countNode = document.querySelector(`[data-chapter-count="${chapterName}"]`);
    if (countNode) countNode.textContent = chapterRecords.length.toString();
  }
}

function setPublicStatementCount(statements) {
  if (totalPublicStatements) totalPublicStatements.textContent = statements.length.toString();
}

function setPersonsCount(persons) {
  if (totalPersons) totalPersons.textContent = persons.length.toString();
}

function setEventDossierCount(dossiers) {
  if (totalEventDossiers) totalEventDossiers.textContent = dossiers.length.toString();
}

function setCompilerGapCount(records) {
  if (totalCompilerGaps) totalCompilerGaps.textContent = records.length.toString();
}

function setScheduleReferenceCount(records) {
  if (totalScheduleReferences) totalScheduleReferences.textContent = records.length.toString();
}

function selectedFilters() {
  return {
    query: searchInput?.value.trim().toLowerCase() || "",
    chapter: chapterFilter?.value || "",
    type: typeFilter?.value || "",
    year: yearFilter?.value || "",
    source: sourceFilter?.value || "",
    confidence: confidenceFilter?.value || "",
    review: reviewFilter?.value || ""
  };
}

function recordMatchesFilters(record, filters) {
  if (filters.query && !searchableText(record).includes(filters.query)) return false;
  if (filters.chapter && record.chapter.name !== filters.chapter) return false;
  if (filters.type && record.documentType !== filters.type) return false;
  if (filters.year && record.date?.slice(0, 4) !== filters.year) return false;
  if (filters.source && record.source?.shortName !== filters.source) return false;
  if (filters.confidence && confidence(record).value !== filters.confidence) return false;
  if (filters.review === "open" && reviewedRecords.has(record.id)) return false;
  if (filters.review === "reviewed" && !reviewedRecords.has(record.id)) return false;
  return true;
}

function selectedReferenceFilters() {
  return {
    query: referenceSearchInput?.value.trim().toLowerCase() || "",
    chapter: referenceChapterFilter?.value || "",
    year: referenceYearFilter?.value || "",
    type: referenceTypeFilter?.value || "",
    voice: referenceVoiceFilter?.value || "",
    relevance: referenceRelevanceFilter?.value || ""
  };
}

function statementMatchesFilters(statement, filters) {
  if (filters.query && !statementSearchableText(statement).includes(filters.query)) return false;
  if (filters.chapter && statement.chapter?.name !== filters.chapter) return false;
  if (filters.year && statement.year !== filters.year) return false;
  if (filters.type && statement.documentType !== filters.type) return false;
  if (filters.voice && statement.publicVoice !== filters.voice) return false;
  if (filters.relevance && statement.relevance !== filters.relevance) return false;
  return true;
}

function personSearchableText(person) {
  return [
    person.entry,
    person.displayName,
    person.sortName,
    ...(person.aliases || []),
    ...(person.sourceTypes || []),
    ...(person.chapters || []).map((chapter) => chapter.name)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function selectedPersonFilters() {
  return {
    query: personSearchInput?.value.trim().toLowerCase() || "",
    chapter: personChapterFilter?.value || "",
    source: personSourceFilter?.value || ""
  };
}

function personMatchesFilters(person, filters) {
  if (filters.query && !personSearchableText(person).includes(filters.query)) return false;
  if (filters.chapter && !(person.chapters || []).some((chapter) => chapter.name === filters.chapter)) return false;
  if (filters.source && !(person.sourceTypes || []).includes(filters.source)) return false;
  return true;
}

function gapSearchableText(record) {
  return [
    record.naid,
    record.title,
    record.documentType,
    record.category,
    record.priority,
    record.why,
    record.sourceName,
    record.sourceNote,
    record.frusSourceNote,
    record.localIdentifier,
    record.containerId,
    record.accessRestrictionStatus,
    record.releaseStatus,
    record.sourceConfidence?.level,
    record.sourceConfidence?.basis,
    ...(record.eventTags || []).map(eventTitle),
    ...(record.matchedQueries || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function selectedGapFilters() {
  return {
    query: gapSearchInput?.value.trim().toLowerCase() || "",
    chapter: gapChapterFilter?.value || "",
    category: gapCategoryFilter?.value || "",
    priority: gapPriorityFilter?.value || "",
    confidence: gapConfidenceFilter?.value || ""
  };
}

function gapMatchesFilters(record, filters) {
  if (filters.query && !gapSearchableText(record).includes(filters.query)) return false;
  if (filters.chapter && record.chapter?.name !== filters.chapter) return false;
  if (filters.category && record.category !== filters.category) return false;
  if (filters.priority && record.priority !== filters.priority) return false;
  if (filters.confidence && record.sourceConfidence?.level !== filters.confidence) return false;
  return true;
}

function mentionTerms(mention) {
  return (mention.matchedTerms || []).map((term) => {
    if (!term?.label) return "";
    return term.count > 1 ? `${term.label} (${term.count})` : term.label;
  }).filter(Boolean);
}

function mentionSearchableText(mention) {
  return [
    mention.title,
    mention.date,
    mention.chapter?.name,
    mention.packageId,
    mention.packageLabel,
    mention.volumeDateSpan,
    mention.citation,
    mention.compilerUse,
    mentionTerms(mention).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function selectedMentionFilters() {
  return {
    query: mentionSearchInput?.value.trim().toLowerCase() || "",
    chapter: mentionChapterFilter?.value || "",
    year: mentionYearFilter?.value || "",
    packageId: mentionPackageFilter?.value || ""
  };
}

function mentionMatchesFilters(mention, filters) {
  if (filters.query && !mentionSearchableText(mention).includes(filters.query)) return false;
  if (filters.chapter && mention.chapter?.name !== filters.chapter) return false;
  if (filters.year && mention.year !== filters.year) return false;
  if (filters.packageId && mention.packageId !== filters.packageId) return false;
  return true;
}

function byStatementChapterThenDate(a, b) {
  return a.chapter.number - b.chapter.number || a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
}

function byStatementDate(a, b) {
  return a.date.localeCompare(b.date) || a.chapter.number - b.chapter.number || a.title.localeCompare(b.title);
}

function sortStatements(statements) {
  const sorted = [...statements];
  const sortMode = referenceSortSelect?.value || "chapter-date";

  if (sortMode === "date") return sorted.sort(byStatementDate);
  if (sortMode === "type") {
    return sorted.sort((a, b) => a.documentType.localeCompare(b.documentType) || byStatementChapterThenDate(a, b));
  }
  if (sortMode === "source") {
    return sorted.sort((a, b) => a.source.shortName.localeCompare(b.source.shortName) || byStatementDate(a, b));
  }

  return sorted.sort(byStatementChapterThenDate);
}

function sortPersons(persons) {
  const sorted = [...persons];
  const sortMode = personSortSelect?.value || "alpha";
  if (sortMode === "references") {
    return sorted.sort((a, b) => b.referenceCount - a.referenceCount || a.sortName.localeCompare(b.sortName));
  }
  return sorted.sort((a, b) => a.sortName.localeCompare(b.sortName) || a.displayName.localeCompare(b.displayName));
}

function sortGaps(records) {
  const sorted = [...records];
  const sortMode = gapSortSelect?.value || "priority";
  const priorityOrder = { High: 0, Medium: 1, Review: 2 };
  const byGapChapterThenDate = (a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title);

  if (sortMode === "date") return sorted.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));
  if (sortMode === "chapter-date") return sorted.sort(byGapChapterThenDate);
  if (sortMode === "category") return sorted.sort((a, b) => a.category.localeCompare(b.category) || byGapChapterThenDate(a, b));
  return sorted.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || byGapChapterThenDate(a, b));
}

function sortMentions(mentions) {
  const sorted = [...mentions];
  const sortMode = mentionSortSelect?.value || "chapter-date";
  const byMentionChapterThenDate = (a, b) => a.chapter.number - b.chapter.number || a.date.localeCompare(b.date) || a.title.localeCompare(b.title);

  if (sortMode === "date") return sorted.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  if (sortMode === "source") return sorted.sort((a, b) => a.packageId.localeCompare(b.packageId) || a.date.localeCompare(b.date));
  return sorted.sort(byMentionChapterThenDate);
}

function applyFilters() {
  const filters = selectedFilters();
  visibleRecords = sortRecords(allRecords.filter((record) => recordMatchesFilters(record, filters)));
  renderRecords(visibleRecords);
  setChapterCounts(allRecords);
  setFilteredCount(visibleRecords, allRecords);
}

function applyReferenceFilters() {
  if (!publicStatementsRoot) return;
  const filters = selectedReferenceFilters();
  visiblePublicStatements = sortStatements(allPublicStatements.filter((statement) => statementMatchesFilters(statement, filters)));
  renderPublicStatements(visiblePublicStatements);
  setReferenceCount(visiblePublicStatements, allPublicStatements);
}

function applyPersonFilters() {
  if (!personsRoot) return;
  const filters = selectedPersonFilters();
  visiblePersons = sortPersons(allPersons.filter((person) => personMatchesFilters(person, filters)));
  renderPersons(visiblePersons);
  setPersonCount(visiblePersons, allPersons);
}

function applyGapFilters() {
  if (!compilerGapsRoot) return;
  const filters = selectedGapFilters();
  visibleCompilerGaps = sortGaps(allCompilerGaps.filter((record) => gapMatchesFilters(record, filters)));
  renderCompilerGaps(visibleCompilerGaps);
  setGapCount(visibleCompilerGaps, allCompilerGaps);
}

function applyMentionFilters() {
  if (!publicMentionsRoot) return;
  const filters = selectedMentionFilters();
  visiblePublicReviewMentions = sortMentions(allPublicReviewMentions.filter((mention) => mentionMatchesFilters(mention, filters)));
  renderPublicReviewMentions(visiblePublicReviewMentions);
  setMentionCount(visiblePublicReviewMentions, allPublicReviewMentions);
}

function setFilteredCount(records, all) {
  if (!filteredCount) return;
  const reviewedCount = records.filter((record) => reviewedRecords.has(record.id)).length;
  filteredCount.textContent = `Showing ${records.length} of ${all.length} records; ${reviewedCount} marked reviewed in this browser.`;
}

function setReferenceCount(statements, all) {
  if (!referenceCount) return;
  const presidential = statements.filter((statement) => statement.publicVoice === "Presidential statement").length;
  referenceCount.textContent = `Showing ${statements.length} of ${all.length} public statements; ${presidential} presidential entries visible.`;
}

function setPersonCount(persons, all) {
  if (!personCount) return;
  personCount.textContent = `Showing ${persons.length} of ${all.length} persons.`;
}

function setGapCount(records, all) {
  if (!gapCount) return;
  const offline = records.filter((record) => !record.pdfUrl).length;
  gapCount.textContent = `Showing ${records.length} of ${all.length} compiler gaps; ${offline} visible records lack online PDFs.`;
}

function setMentionCount(mentions, all) {
  if (!mentionCount) return;
  mentionCount.textContent = `Showing ${mentions.length} of ${all.length} passing mentions.`;
}

function createMeta(record) {
  const meta = document.createElement("div");
  meta.className = "record-meta";

  for (const value of [
    record.documentType,
    record.source?.shortName,
    record.localIdentifier,
    record.pdfUrl ? "Online PDF" : "Catalog only",
    record.pageCount ? `${record.pageCount} pages` : "pages unmeasured",
    record.sourceConfidence?.level,
    `NAID ${record.naid}`,
    record.releaseStatus
  ]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  return meta;
}

function createTopicTerms(record) {
  const terms = [...new Set(getTerms(record))];
  if (!terms.length) return null;
  const line = document.createElement("p");
  line.className = "record-terms";
  line.textContent = `Matched evidence: ${terms.join(", ")}`;
  return line;
}

function createPdfExtractLine(record) {
  if (!record.pdfExtract && !record.sourceConfidence) return null;
  const details = [
    record.pdfExtract?.classificationMarking ? `classification: ${record.pdfExtract.classificationMarking}` : "",
    record.pdfExtract?.dateTimePlace ? `date/time/place: ${record.pdfExtract.dateTimePlace}` : "",
    record.pdfExtract?.participants ? "participants parsed" : "participants not isolated",
    record.pdfExtract?.subject ? `subject: ${record.pdfExtract.subject}` : ""
  ].filter(Boolean);
  const line = document.createElement("p");
  line.className = "record-pdf-check";
  line.textContent = `PDF first-page check: ${details.join("; ") || record.sourceConfidence?.basis || "metadata pending"}`;
  return line;
}

function createSignalLine(record) {
  const matches = signalMatches(record);
  if (!matches.length) return null;
  const line = document.createElement("p");
  line.className = "record-signals";
  line.textContent = `Compiler flags: ${matches.map((signal) => signal.label).join("; ")}`;
  return line;
}

function createScheduleReferenceLine(record) {
  const references = scheduleReferences(record);
  if (!references.length) return null;

  const line = document.createElement("p");
  line.className = "record-schedule";
  line.append(document.createTextNode("Daily Diary/Backup control: "));

  references.forEach((reference, index) => {
    if (index) line.append(document.createTextNode("; "));
    const link = document.createElement("a");
    link.href = reference.catalogUrl || reference.pdfUrl || "#";
    link.rel = "noreferrer";
    const empty = reference.isEmptyDiary && !/\[EMPTY\]/i.test(reference.title) ? " [empty]" : "";
    link.textContent = `${reference.title}${empty}`;
    line.append(link);
  });

  line.append(document.createTextNode(". Same-day schedule-control source; verify time/place or call context against the PDF."));
  return line;
}

function createRecordActions(record) {
  const actions = document.createElement("div");
  actions.className = "record-actions";

  const reviewButton = document.createElement("button");
  reviewButton.type = "button";
  reviewButton.dataset.action = "toggle-review";
  reviewButton.dataset.recordId = record.id;
  reviewButton.textContent = reviewedRecords.has(record.id) ? "Reviewed" : "Mark reviewed";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.action = "copy-note";
  copyButton.dataset.recordId = record.id;
  copyButton.textContent = "Copy source stub";

  actions.append(reviewButton, copyButton);
  return actions;
}

function createRecordRow(record) {
  const row = document.createElement("article");
  row.className = "record-row";
  if (reviewedRecords.has(record.id)) row.classList.add("is-reviewed");

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = record.date;
  date.textContent = shortDate(record.date);

  const body = document.createElement("div");
  const titleLine = document.createElement("div");
  titleLine.className = "record-title-line";

  const title = document.createElement("a");
  title.className = "record-title";
  title.href = record.catalogUrl || record.pdfUrl;
  title.rel = "noreferrer";
  title.textContent = record.documentTitle || record.title;

  const confidenceBadge = document.createElement("span");
  const confidenceInfo = confidence(record);
  confidenceBadge.className = `confidence-badge ${confidenceInfo.value}`;
  confidenceBadge.textContent = confidenceInfo.label;

  titleLine.append(title, confidenceBadge);

  const sourceNote = document.createElement("p");
  sourceNote.className = "record-source-note";
  sourceNote.textContent = `FRUS-style source note draft: ${frusSourceNote(record)}`;

  const trail = document.createElement("p");
  trail.className = "record-catalog-trail";
  trail.textContent = `Catalog trail: ${catalogTrail(record)}`;

  const terms = createTopicTerms(record);
  const signals = createSignalLine(record);
  const pdfCheck = createPdfExtractLine(record);
  const scheduleLine = createScheduleReferenceLine(record);
  body.append(titleLine, createMeta(record));
  if (terms) body.append(terms);
  if (signals) body.append(signals);
  if (pdfCheck) body.append(pdfCheck);
  if (scheduleLine) body.append(scheduleLine);
  body.append(sourceNote);
  if (catalogTrail(record)) body.append(trail);
  body.append(createRecordActions(record));

  const links = document.createElement("div");
  links.className = "record-links";

  if (record.catalogUrl) {
    const catalog = document.createElement("a");
    catalog.href = record.catalogUrl;
    catalog.rel = "noreferrer";
    catalog.textContent = "Catalog";
    links.append(catalog);
  }

  if (record.pdfUrl) {
    const pdf = document.createElement("a");
    pdf.href = record.pdfUrl;
    pdf.rel = "noreferrer";
    pdf.textContent = "Open PDF";
    links.append(pdf);
  }

  row.append(date, body, links);
  return row;
}

function createStatementMeta(statement) {
  const meta = document.createElement("div");
  meta.className = "record-meta";

  for (const value of [
    statement.documentType,
    statement.publicVoice,
    statement.source?.shortName,
    statement.pageRange
  ]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  return meta;
}

function createStatementTerms(statement) {
  const terms = statementTerms(statement);
  if (!terms.length) return null;
  const line = document.createElement("p");
  line.className = "record-signals";
  line.textContent = `Public Papers signals: ${terms.join("; ")}`;
  return line;
}

function createStatementActions(statement) {
  const actions = document.createElement("div");
  actions.className = "record-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.action = "copy-reference";
  copyButton.dataset.statementId = statement.id;
  copyButton.textContent = "Copy citation";

  actions.append(copyButton);
  return actions;
}

function createStatementRow(statement) {
  const row = document.createElement("article");
  row.className = "record-row reference-row";

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = statement.date;
  date.textContent = shortDate(statement.date);

  const body = document.createElement("div");
  const titleLine = document.createElement("div");
  titleLine.className = "record-title-line";

  const title = document.createElement("a");
  title.className = "record-title";
  title.href = statement.pdfPageUrl || statement.govinfoUrl;
  title.rel = "noreferrer";
  title.textContent = statement.title;

  const badge = document.createElement("span");
  badge.className = `confidence-badge ${statement.relevance === "Title anchor" ? "strong" : "solid"}`;
  badge.textContent = statement.relevance;

  titleLine.append(title, badge);

  const sourceNote = document.createElement("p");
  sourceNote.className = "record-source-note";
  sourceNote.textContent = `Source note: ${statement.sourceNote || statement.citation}`;

  const terms = createStatementTerms(statement);
  body.append(titleLine, createStatementMeta(statement));
  if (terms) body.append(terms);
  body.append(sourceNote, createStatementActions(statement));

  const links = document.createElement("div");
  links.className = "record-links";

  if (statement.govinfoUrl) {
    const govinfo = document.createElement("a");
    govinfo.href = statement.govinfoUrl;
    govinfo.rel = "noreferrer";
    govinfo.textContent = "GovInfo";
    links.append(govinfo);
  }

  if (statement.pdfPageUrl) {
    const pdf = document.createElement("a");
    pdf.href = statement.pdfPageUrl;
    pdf.rel = "noreferrer";
    pdf.textContent = "PDF page";
    links.append(pdf);
  }

  row.append(date, body, links);
  return row;
}

function createPersonItem(person) {
  const item = document.createElement("li");
  item.className = "person-item";

  const text = document.createElement("span");
  text.textContent = person.entry;
  item.append(text);

  const actions = document.createElement("span");
  actions.className = "person-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.action = "copy-person";
  copyButton.dataset.personId = person.id;
  copyButton.textContent = "Copy";
  actions.append(copyButton);

  item.append(actions);
  return item;
}

function createCompactList(title, records, emptyText) {
  const section = document.createElement("div");
  section.className = "dossier-list";
  const heading = document.createElement("h4");
  heading.textContent = title;
  section.append(heading);

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "dossier-empty";
    empty.textContent = emptyText;
    section.append(empty);
    return section;
  }

  const list = document.createElement("ul");
  for (const record of records.slice(0, 4)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = record.catalogUrl || record.govinfoUrl || record.pdfUrl || "#";
    link.rel = "noreferrer";
    link.textContent = record.title;
    item.append(link);
    const meta = document.createElement("span");
    meta.textContent = [record.date, record.documentType, record.pageCount ? `${record.pageCount} pages` : ""].filter(Boolean).join(" | ");
    item.append(meta);
    list.append(item);
  }
  section.append(list);
  return section;
}

function createDossierCard(event) {
  const card = document.createElement("article");
  card.className = "dossier-card";

  const title = document.createElement("h3");
  title.textContent = event.title;

  const meta = document.createElement("p");
  meta.className = "dossier-meta";
  meta.textContent = `${event.chapter.name} | ${event.dateRange}`;

  const summary = document.createElement("p");
  summary.className = "dossier-summary";
  summary.textContent = event.summary;

  const counts = document.createElement("div");
  counts.className = "dossier-counts";
  for (const [label, value] of [
    ["Conversations", event.counts?.declassifiedConversations || 0],
    ["Gaps", event.counts?.compilerGaps || 0],
    ["Public refs", event.counts?.publicStatements || 0],
    ["Review hits", event.counts?.publicReviewMentions || 0]
  ]) {
    const item = document.createElement("div");
    const number = document.createElement("strong");
    number.textContent = value.toString();
    const text = document.createElement("span");
    text.textContent = label;
    item.append(number, text);
    counts.append(item);
  }

  const action = document.createElement("p");
  action.className = "dossier-action";
  action.textContent = `Next check: ${event.nextAction}`;

  card.append(
    title,
    meta,
    summary,
    counts,
    action,
    createCompactList("Conversation leads", event.privateRecords || [], "No declassified memcon/telcon leads in this bundle."),
    createCompactList("Gap targets", event.gapRecords || [], "No separate gap targets in this bundle."),
    createCompactList("Public anchors", event.publicStatements || [], "No promoted Public Papers anchors in this bundle.")
  );
  return card;
}

function createGapMeta(record) {
  const meta = document.createElement("div");
  meta.className = "record-meta";
  for (const value of [
    record.category,
    record.sourceName,
    record.pdfUrl ? "Online PDF" : "No online PDF",
    record.pageCount ? `${record.pageCount} pages` : "",
    record.sourceConfidence?.level,
    `NAID ${record.naid}`,
    record.accessRestrictionStatus
  ]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }
  return meta;
}

function createGapRow(record) {
  const row = document.createElement("article");
  row.className = "record-row gap-row";

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = record.date;
  date.textContent = record.date ? shortDate(record.date) : "No date";

  const body = document.createElement("div");
  const titleLine = document.createElement("div");
  titleLine.className = "record-title-line";

  const title = document.createElement("a");
  title.className = "record-title";
  title.href = record.catalogUrl || record.pdfUrl;
  title.rel = "noreferrer";
  title.textContent = record.title;

  const badge = document.createElement("span");
  badge.className = `confidence-badge ${record.priority === "High" ? "strong" : record.priority === "Medium" ? "solid" : "review"}`;
  badge.textContent = `${record.priority} priority`;

  titleLine.append(title, badge);

  const why = document.createElement("p");
  why.className = "record-signals";
  why.textContent = `Compiler risk: ${record.why}`;

  const events = document.createElement("p");
  events.className = "record-terms";
  events.textContent = `Event tags: ${(record.eventTags || []).map(eventTitle).join("; ") || "none assigned"}`;

  const sourceNote = document.createElement("p");
  sourceNote.className = "record-source-note";
  sourceNote.textContent = `Source note: ${record.frusSourceNote || record.sourceNote || "Source note pending."}`;

  const confidenceLine = document.createElement("p");
  confidenceLine.className = "record-catalog-trail";
  confidenceLine.textContent = `Source state: ${record.sourceConfidence?.basis || "No source-state note recorded."}`;

  body.append(titleLine, createGapMeta(record), why, events, sourceNote, confidenceLine, createGapActions(record));

  const links = document.createElement("div");
  links.className = "record-links";
  if (record.catalogUrl) {
    const catalog = document.createElement("a");
    catalog.href = record.catalogUrl;
    catalog.rel = "noreferrer";
    catalog.textContent = "Catalog";
    links.append(catalog);
  }
  if (record.pdfUrl) {
    const pdf = document.createElement("a");
    pdf.href = record.pdfUrl;
    pdf.rel = "noreferrer";
    pdf.textContent = "Open PDF";
    links.append(pdf);
  }

  row.append(date, body, links);
  return row;
}

function createGapActions(record) {
  const actions = document.createElement("div");
  actions.className = "record-actions";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.action = "copy-gap";
  copyButton.dataset.gapId = record.id;
  copyButton.textContent = "Copy gap stub";
  actions.append(copyButton);
  return actions;
}

function createMentionRow(mention) {
  const row = document.createElement("article");
  row.className = "record-row mention-row";

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = mention.date;
  date.textContent = shortDate(mention.date);

  const body = document.createElement("div");
  const titleLine = document.createElement("div");
  titleLine.className = "record-title-line";

  const title = document.createElement("a");
  title.className = "record-title";
  title.href = mention.govinfoUrl || mention.pdfUrl;
  title.rel = "noreferrer";
  title.textContent = mention.title;

  const badge = document.createElement("span");
  badge.className = "confidence-badge review";
  badge.textContent = "Review mention";
  titleLine.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "record-meta";
  for (const value of [mention.packageId, mention.pageRange, mention.chapter?.name]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  const terms = document.createElement("p");
  terms.className = "record-signals";
  terms.textContent = `Passing signals: ${mentionTerms(mention).join("; ") || "keyword hit"}`;

  const sourceNote = document.createElement("p");
  sourceNote.className = "record-source-note";
  sourceNote.textContent = `Source note: ${mention.sourceNote || mention.citation}`;

  body.append(titleLine, meta, terms, sourceNote, createMentionActions(mention));

  const links = document.createElement("div");
  links.className = "record-links";
  if (mention.govinfoUrl) {
    const govinfo = document.createElement("a");
    govinfo.href = mention.govinfoUrl;
    govinfo.rel = "noreferrer";
    govinfo.textContent = "GovInfo";
    links.append(govinfo);
  }
  if (mention.pdfUrl) {
    const pdf = document.createElement("a");
    pdf.href = mention.pdfUrl;
    pdf.rel = "noreferrer";
    pdf.textContent = "PDF";
    links.append(pdf);
  }

  row.append(date, body, links);
  return row;
}

function createMentionActions(mention) {
  const actions = document.createElement("div");
  actions.className = "record-actions";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.action = "copy-mention";
  copyButton.dataset.mentionId = mention.id;
  copyButton.textContent = "Copy citation";
  actions.append(copyButton);
  return actions;
}

function createEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "No records match the current filters.";
  return empty;
}

function createReferenceEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "No public statements match the current filters.";
  return empty;
}

function createGapEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "No compiler gaps match the current filters.";
  return empty;
}

function createMentionEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "No Public Papers passing mentions match the current filters.";
  return empty;
}

function createPersonEmptyState() {
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.textContent = "No persons match the current filters.";
  return empty;
}

function renderRecords(records) {
  recordsRoot.replaceChildren();

  if (!records.length) {
    recordsRoot.append(createEmptyState());
    return;
  }

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    if (!chapterRecords.length) continue;

    const section = document.createElement("section");
    section.className = "record-chapter";
    section.id = chapterId(chapterName);

    const header = document.createElement("div");
    header.className = "record-chapter-header";

    const heading = document.createElement("h3");
    heading.textContent = `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;

    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterRecords.length} records`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list";
    for (const record of chapterRecords) list.append(createRecordRow(record));

    section.append(header, list);
    recordsRoot.append(section);
  }
}

function renderPublicStatements(statements) {
  if (!publicStatementsRoot) return;
  publicStatementsRoot.replaceChildren();

  if (!statements.length) {
    publicStatementsRoot.append(createReferenceEmptyState());
    return;
  }

  for (const chapterName of CHAPTER_ORDER) {
    const chapterStatements = statements.filter((statement) => statement.chapter.name === chapterName);
    if (!chapterStatements.length) continue;

    const section = document.createElement("section");
    section.className = "record-chapter reference-chapter";

    const header = document.createElement("div");
    header.className = "record-chapter-header";

    const heading = document.createElement("h3");
    heading.textContent = `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;

    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterStatements.length} public statements`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list reference-list";
    for (const statement of chapterStatements) list.append(createStatementRow(statement));

    section.append(header, list);
    publicStatementsRoot.append(section);
  }
}

function renderPersons(persons) {
  if (!personsRoot) return;
  personsRoot.replaceChildren();
  if (!persons.length) {
    personsRoot.append(createPersonEmptyState());
    return;
  }
  for (const person of persons) personsRoot.append(createPersonItem(person));
}

function renderEventDossiers(dossiers) {
  if (!eventDossiersRoot) return;
  eventDossiersRoot.replaceChildren();
  if (!dossiers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No event dossiers are available.";
    eventDossiersRoot.append(empty);
    return;
  }
  for (const event of dossiers) eventDossiersRoot.append(createDossierCard(event));
}

function renderCompilerGaps(records) {
  if (!compilerGapsRoot) return;
  compilerGapsRoot.replaceChildren();

  if (!records.length) {
    compilerGapsRoot.append(createGapEmptyState());
    return;
  }

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    if (!chapterRecords.length) continue;

    const section = document.createElement("section");
    section.className = "record-chapter gap-chapter";

    const header = document.createElement("div");
    header.className = "record-chapter-header";
    const heading = document.createElement("h3");
    heading.textContent = `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;
    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterRecords.length} gap candidates`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list gap-list";
    for (const record of chapterRecords) list.append(createGapRow(record));

    section.append(header, list);
    compilerGapsRoot.append(section);
  }
}

function renderPublicReviewMentions(mentions) {
  if (!publicMentionsRoot) return;
  publicMentionsRoot.replaceChildren();

  if (!mentions.length) {
    publicMentionsRoot.append(createMentionEmptyState());
    return;
  }

  for (const chapterName of CHAPTER_ORDER) {
    const chapterMentions = mentions.filter((mention) => mention.chapter.name === chapterName);
    if (!chapterMentions.length) continue;

    const section = document.createElement("section");
    section.className = "record-chapter mention-chapter";

    const header = document.createElement("div");
    header.className = "record-chapter-header";
    const heading = document.createElement("h3");
    heading.textContent = `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;
    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterMentions.length} passing mentions`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list mention-list";
    for (const mention of chapterMentions) list.append(createMentionRow(mention));

    section.append(header, list);
    publicMentionsRoot.append(section);
  }
}

function resetFilters() {
  for (const control of [searchInput, chapterFilter, typeFilter, yearFilter, sourceFilter, confidenceFilter, reviewFilter]) {
    if (control) control.value = "";
  }
  if (sortSelect) sortSelect.value = "chapter-date";
  applyFilters();
}

function resetReferenceFilters() {
  for (const control of [
    referenceSearchInput,
    referenceChapterFilter,
    referenceYearFilter,
    referenceTypeFilter,
    referenceVoiceFilter,
    referenceRelevanceFilter
  ]) {
    if (control) control.value = "";
  }
  if (referenceSortSelect) referenceSortSelect.value = "chapter-date";
  applyReferenceFilters();
}

function resetPersonFilters() {
  for (const control of [personSearchInput, personChapterFilter, personSourceFilter]) {
    if (control) control.value = "";
  }
  if (personSortSelect) personSortSelect.value = "alpha";
  applyPersonFilters();
}

function resetGapFilters() {
  for (const control of [gapSearchInput, gapChapterFilter, gapCategoryFilter, gapPriorityFilter, gapConfidenceFilter]) {
    if (control) control.value = "";
  }
  if (gapSortSelect) gapSortSelect.value = "priority";
  applyGapFilters();
}

function resetMentionFilters() {
  for (const control of [mentionSearchInput, mentionChapterFilter, mentionYearFilter, mentionPackageFilter]) {
    if (control) control.value = "";
  }
  if (mentionSortSelect) mentionSortSelect.value = "chapter-date";
  applyMentionFilters();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportVisibleRecords() {
  const headers = [
    "chapter",
    "date",
    "document_type",
    "confidence",
    "reviewed",
    "title",
    "naid",
    "page_count",
    "source_confidence",
    "pdf_subject",
    "pdf_participants",
    "pdf_date_time_place",
    "classification",
    "catalog_url",
    "pdf_url",
    "matched_terms",
    "compiler_flags",
    "daily_diary_backup_references",
    "frus_source_note_draft",
    "catalog_trail"
  ];

  const rows = visibleRecords.map((record) => {
    const confidenceInfo = confidence(record);
    return [
      record.chapter.name,
      record.date,
      record.documentType,
      confidenceInfo.label,
      reviewedRecords.has(record.id) ? "yes" : "no",
      record.documentTitle || record.title,
      record.naid,
      record.pageCount || "",
      record.sourceConfidence?.level || "",
      record.pdfExtract?.subject || "",
      record.pdfExtract?.participants || "",
      record.pdfExtract?.dateTimePlace || "",
      record.pdfExtract?.classificationMarking || "",
      record.catalogUrl,
      record.pdfUrl,
      [...new Set(getTerms(record))].join("; "),
      signalMatches(record).map((signal) => signal.label).join("; "),
      scheduleReferenceSummary(record),
      frusSourceNote(record),
      catalogTrail(record)
    ].map(csvEscape).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  downloadTextFile("frus-v28-visible-memcons-telcons.csv", csv, "text/csv;charset=utf-8");
}

function filterSummary() {
  const filters = selectedFilters();
  return [
    filters.query ? `search=${filters.query}` : "",
    filters.chapter ? `chapter=${filters.chapter}` : "",
    filters.type ? `type=${filters.type}` : "",
    filters.year ? `year=${filters.year}` : "",
    filters.source ? `source=${filters.source}` : "",
    filters.confidence ? `match=${filters.confidence}` : "",
    filters.review ? `review=${filters.review}` : "",
    sortSelect?.value ? `sort=${sortSelect.value}` : ""
  ].filter(Boolean).join("; ") || "all declassified memcons/telcons";
}

function pdfVerificationSummary(record) {
  return [
    record.pdfExtract?.classificationMarking ? `classification: ${record.pdfExtract.classificationMarking}` : "",
    record.pdfExtract?.dateTimePlace ? `date/time/place: ${record.pdfExtract.dateTimePlace}` : "",
    record.pdfExtract?.participants ? `participants: ${record.pdfExtract.participants}` : "",
    record.pdfExtract?.subject ? `subject: ${record.pdfExtract.subject}` : "",
    record.sourceConfidence?.basis ? `source confidence: ${record.sourceConfidence.basis}` : ""
  ].filter(Boolean).join("; ") || "PDF verification metadata pending.";
}

function packetRecordBlock(record, index) {
  const terms = [...new Set(getTerms(record))].join(", ") || "none";
  const flags = signalMatches(record).map((signal) => signal.label).join("; ") || "none detected";
  return [
    `### ${index}. ${record.date} - ${record.documentTitle || record.title}`,
    "",
    `- Chapter: ${record.chapter.name}`,
    `- Type: ${record.documentType}`,
    `- NAID: ${record.naid}`,
    `- Pages: ${record.pageCount || "unmeasured"}${record.pageCountBasis ? ` (${record.pageCountBasis})` : ""}`,
    `- Catalog: ${record.catalogUrl || "not listed"}`,
    `- PDF: ${record.pdfUrl || "not available"}`,
    `- FRUS-style source note draft: ${frusSourceNote(record)}`,
    `- Daily Diary/Backup controls: ${scheduleReferenceSummary(record) || "none matched"}`,
    `- Daily Diary/Backup source notes: ${scheduleReferenceSourceNotes(record) || "none matched"}`,
    `- PDF verification: ${pdfVerificationSummary(record)}`,
    `- Matched evidence: ${terms}`,
    `- Compiler flags: ${flags}`,
    `- Catalog trail: ${catalogTrail(record) || "none"}`,
    ""
  ].join("\n");
}

function compilerPacket(records) {
  const generated = new Date().toISOString();
  const lines = [
    "# FRUS Volume XXVIII Declassified Chronology Packet",
    "",
    `Generated: ${generated}`,
    `Visible records: ${records.length}`,
    `Filters: ${filterSummary()}`,
    "",
    "Scope: declassified presidential memoranda of conversation and telephone conversations with online PDFs. Daily Diary/Backup entries are same-day schedule-control references, not substitute conversation transcripts.",
    ""
  ];

  let index = 1;
  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    if (!chapterRecords.length) continue;
    lines.push(`## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
    for (const record of chapterRecords) {
      lines.push(packetRecordBlock(record, index));
      index += 1;
    }
  }

  lines.push("## Verification Reminder", "");
  lines.push("Confirm exact dateline, participants, original classification, distribution/drafting data, excisions, and any meeting-place or cross-reference editorial notes directly in the PDF before publication.");
  return lines.join("\n");
}

function exportCompilerPacket() {
  const packet = compilerPacket(visibleRecords);
  downloadTextFile("frus-v28-visible-compiler-packet.md", packet, "text/markdown;charset=utf-8");
}

function exportVisibleGaps() {
  const headers = [
    "chapter",
    "date",
    "priority",
    "category",
    "title",
    "naid",
    "page_count",
    "page_count_basis",
    "source_confidence",
    "access_status",
    "why",
    "event_tags",
    "catalog_url",
    "pdf_url",
    "source_note"
  ];

  const rows = visibleCompilerGaps.map((record) => [
    record.chapter.name,
    record.date,
    record.priority,
    record.category,
    record.title,
    record.naid,
    record.pageCount || "",
    record.pageCountBasis || "",
    record.sourceConfidence?.level || "",
    record.accessRestrictionStatus || "",
    record.why || "",
    (record.eventTags || []).map(eventTitle).join("; "),
    record.catalogUrl,
    record.pdfUrl,
    record.frusSourceNote || record.sourceNote
  ].map(csvEscape).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frus-v28-compiler-gaps.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportVisibleReferences() {
  const headers = [
    "chapter",
    "date",
    "document_type",
    "public_voice",
    "relevance",
    "title",
    "citation",
    "govinfo_url",
    "pdf_page_url",
    "matched_terms"
  ];

  const rows = visiblePublicStatements.map((statement) => [
    statement.chapter.name,
    statement.date,
    statement.documentType,
    statement.publicVoice,
    statement.relevance,
    statement.title,
    statement.citation,
    statement.govinfoUrl,
    statement.pdfPageUrl,
    statementTerms(statement).join("; ")
  ].map(csvEscape).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frus-v28-public-statements.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportVisiblePersons() {
  const headers = [
    "sort_name",
    "display_name",
    "entry",
    "chapters",
    "source_types",
    "reference_count",
    "references"
  ];

  const rows = visiblePersons.map((person) => [
    person.sortName,
    person.displayName,
    person.entry,
    (person.chapters || []).map((chapter) => chapter.name).join("; "),
    (person.sourceTypes || []).join("; "),
    person.referenceCount,
    (person.references || []).map((reference) => `${reference.date || ""} ${reference.title}`).join("; ")
  ].map(csvEscape).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frus-v28-persons.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportVisibleMentions() {
  const headers = [
    "chapter",
    "date",
    "title",
    "package_id",
    "page_range",
    "citation",
    "govinfo_url",
    "pdf_url",
    "matched_terms"
  ];

  const rows = visiblePublicReviewMentions.map((mention) => [
    mention.chapter.name,
    mention.date,
    mention.title,
    mention.packageId,
    mention.pageRange,
    mention.citation,
    mention.govinfoUrl,
    mention.pdfUrl,
    mentionTerms(mention).join("; ")
  ].map(csvEscape).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frus-v28-public-papers-review-mentions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function compilerStub(record) {
  const flags = signalMatches(record).map((signal) => signal.label).join("; ") || "none detected";
  const terms = [...new Set(getTerms(record))].join(", ") || "none";

  return [
    `${shortDate(record.date)} - ${record.documentTitle || record.title}`,
    `Chapter: ${record.chapter.name}`,
    `Document type: ${record.documentType}`,
    `Source series: ${record.source?.title || record.source?.shortName || "Presidential conversation files"}`,
    `NAID: ${record.naid}`,
    `Pages: ${record.pageCount || "unmeasured"}${record.pageCountBasis ? ` (${record.pageCountBasis})` : ""}`,
    `Source confidence: ${record.sourceConfidence?.level || "pending"}${record.sourceConfidence?.basis ? ` - ${record.sourceConfidence.basis}` : ""}`,
    `Catalog: ${record.catalogUrl || ""}`,
    `PDF: ${record.pdfUrl || ""}`,
    `FRUS-style source note draft: ${frusSourceNote(record)}`,
    `Catalog trail: ${catalogTrail(record)}`,
    `Daily Diary/Backup control: ${scheduleReferenceSummary(record) || "none matched"}`,
    `Daily Diary/Backup source notes: ${scheduleReferenceSourceNotes(record) || "none matched"}`,
    `PDF subject: ${record.pdfExtract?.subject || "not isolated"}`,
    `PDF participants: ${record.pdfExtract?.participants || "not isolated"}`,
    `PDF date/time/place: ${record.pdfExtract?.dateTimePlace || "not isolated"}`,
    `PDF classification marking: ${record.pdfExtract?.classificationMarking || "not isolated"}`,
    `Matched evidence: ${terms}`,
    `Compiler flags: ${flags}`,
    "FRUS verification: confirm exact dateline, participants, original classification, distribution/drafting data, excisions, and any meeting-place or cross-reference editorial notes directly in the PDF before publication."
  ].join("\n");
}

function referenceStub(statement) {
  return [
    `${shortDate(statement.date)} - ${statement.title}`,
    `Chapter: ${statement.chapter.name}`,
    `Document type: ${statement.documentType}`,
    `Public voice: ${statement.publicVoice}`,
    `Source note: ${statement.sourceNote || statement.citation}`,
    `GovInfo: ${statement.govinfoUrl || ""}`,
    `PDF page: ${statement.pdfPageUrl || statement.pdfUrl || ""}`,
    `Matched public-paper signals: ${statementTerms(statement).join(", ") || "none"}`
  ].join("\n");
}

function personStub(person) {
  return [
    person.entry,
    `Chapters: ${(person.chapters || []).map((chapter) => chapter.name).join(", ") || "none matched"}`,
    `Source basis: ${(person.sourceTypes || []).join(", ") || "none matched"}`,
    `Matched references: ${person.referenceCount}`,
    ...(person.references || []).slice(0, 8).map((reference) => `- ${reference.date || ""} ${reference.title}`.trim())
  ].join("\n");
}

function gapStub(record) {
  return [
    `${record.date ? shortDate(record.date) : "No date"} - ${record.title}`,
    `Chapter: ${record.chapter.name}`,
    `Priority: ${record.priority}`,
    `Category: ${record.category}`,
    `Why it matters: ${record.why}`,
    `Source state: ${record.sourceConfidence?.level || "pending"} - ${record.sourceConfidence?.basis || ""}`,
    `Pages: ${record.pageCount || "unknown"}${record.pageCountBasis ? ` (${record.pageCountBasis})` : ""}`,
    `NAID: ${record.naid}`,
    `Catalog: ${record.catalogUrl || ""}`,
    `PDF: ${record.pdfUrl || ""}`,
    `Event tags: ${(record.eventTags || []).map(eventTitle).join(", ") || "none assigned"}`,
    `Source note: ${record.frusSourceNote || record.sourceNote || "pending"}`
  ].join("\n");
}

function mentionStub(mention) {
  return [
    `${shortDate(mention.date)} - ${mention.title}`,
    `Chapter: ${mention.chapter.name}`,
    `Source note: ${mention.sourceNote || mention.citation}`,
    `GovInfo: ${mention.govinfoUrl || ""}`,
    `PDF: ${mention.pdfUrl || ""}`,
    `Matched terms: ${mentionTerms(mention).join(", ") || "keyword hit"}`
  ].join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function flashButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function handleRecordAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const record = allRecords.find((item) => item.id === button.dataset.recordId);
  if (!record) return;

  if (button.dataset.action === "toggle-review") {
    if (reviewedRecords.has(record.id)) {
      reviewedRecords.delete(record.id);
    } else {
      reviewedRecords.add(record.id);
    }

    saveReviewedRecords();
    applyFilters();
    return;
  }

  if (button.dataset.action === "copy-note") {
    copyText(compilerStub(record))
      .then((copied) => flashButton(button, copied ? "Copied" : "Copy failed"))
      .catch(() => flashButton(button, "Copy failed"));
  }
}

function handleReferenceAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const statement = allPublicStatements.find((item) => item.id === button.dataset.statementId);
  if (!statement) return;

  if (button.dataset.action === "copy-reference") {
    copyText(referenceStub(statement))
      .then((copied) => flashButton(button, copied ? "Copied" : "Copy failed"))
      .catch(() => flashButton(button, "Copy failed"));
  }
}

function handlePersonAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const person = allPersons.find((item) => item.id === button.dataset.personId);
  if (!person) return;

  if (button.dataset.action === "copy-person") {
    copyText(personStub(person))
      .then((copied) => flashButton(button, copied ? "Copied" : "Copy failed"))
      .catch(() => flashButton(button, "Copy failed"));
  }
}

function handleGapAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const record = allCompilerGaps.find((item) => item.id === button.dataset.gapId);
  if (!record) return;

  if (button.dataset.action === "copy-gap") {
    copyText(gapStub(record))
      .then((copied) => flashButton(button, copied ? "Copied" : "Copy failed"))
      .catch(() => flashButton(button, "Copy failed"));
  }
}

function handleMentionAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const mention = allPublicReviewMentions.find((item) => item.id === button.dataset.mentionId);
  if (!mention) return;

  if (button.dataset.action === "copy-mention") {
    copyText(mentionStub(mention))
      .then((copied) => flashButton(button, copied ? "Copied" : "Copy failed"))
      .catch(() => flashButton(button, "Copy failed"));
  }
}

function enableChapterCards() {
  for (const card of document.querySelectorAll(".chapter-card")) {
    card.addEventListener("click", (event) => {
      const targetId = card.getAttribute("href");
      if (!targetId?.startsWith("#")) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", targetId);
      target.scrollIntoView({ block: "start" });
    });
  }
}

function bindWorkbench() {
  for (const control of [searchInput, chapterFilter, typeFilter, yearFilter, sourceFilter, confidenceFilter, reviewFilter, sortSelect]) {
    control?.addEventListener("input", applyFilters);
    control?.addEventListener("change", applyFilters);
  }

  resetButton?.addEventListener("click", resetFilters);
  exportButton?.addEventListener("click", exportVisibleRecords);
  packetExportButton?.addEventListener("click", exportCompilerPacket);
  recordsRoot.addEventListener("click", handleRecordAction);
}

function bindReferenceWorkbench() {
  for (const control of [
    referenceSearchInput,
    referenceChapterFilter,
    referenceYearFilter,
    referenceTypeFilter,
    referenceVoiceFilter,
    referenceRelevanceFilter,
    referenceSortSelect
  ]) {
    control?.addEventListener("input", applyReferenceFilters);
    control?.addEventListener("change", applyReferenceFilters);
  }

  referenceResetButton?.addEventListener("click", resetReferenceFilters);
  referenceExportButton?.addEventListener("click", exportVisibleReferences);
  publicStatementsRoot?.addEventListener("click", handleReferenceAction);
}

function bindPersonWorkbench() {
  for (const control of [personSearchInput, personChapterFilter, personSourceFilter, personSortSelect]) {
    control?.addEventListener("input", applyPersonFilters);
    control?.addEventListener("change", applyPersonFilters);
  }

  personResetButton?.addEventListener("click", resetPersonFilters);
  personExportButton?.addEventListener("click", exportVisiblePersons);
  personsRoot?.addEventListener("click", handlePersonAction);
}

function bindGapWorkbench() {
  for (const control of [gapSearchInput, gapChapterFilter, gapCategoryFilter, gapPriorityFilter, gapConfidenceFilter, gapSortSelect]) {
    control?.addEventListener("input", applyGapFilters);
    control?.addEventListener("change", applyGapFilters);
  }

  gapResetButton?.addEventListener("click", resetGapFilters);
  gapExportButton?.addEventListener("click", exportVisibleGaps);
  compilerGapsRoot?.addEventListener("click", handleGapAction);
}

function bindMentionWorkbench() {
  for (const control of [mentionSearchInput, mentionChapterFilter, mentionYearFilter, mentionPackageFilter, mentionSortSelect]) {
    control?.addEventListener("input", applyMentionFilters);
    control?.addEventListener("change", applyMentionFilters);
  }

  mentionResetButton?.addEventListener("click", resetMentionFilters);
  mentionExportButton?.addEventListener("click", exportVisibleMentions);
  publicMentionsRoot?.addEventListener("click", handleMentionAction);
}

async function loadRecords() {
  const response = await fetch("data/records.json");
  if (!response.ok) throw new Error(`Could not load records: ${response.status}`);
  return response.json();
}

async function loadPublicStatements() {
  if (window.BUSH_PUBLIC_STATEMENTS) return window.BUSH_PUBLIC_STATEMENTS;
  const response = await fetch("data/public-statements.json");
  if (!response.ok) throw new Error(`Could not load public statements: ${response.status}`);
  return response.json();
}

async function loadPersons() {
  if (window.FRUS_PERSONS) return window.FRUS_PERSONS;
  const response = await fetch("data/persons.json");
  if (!response.ok) throw new Error(`Could not load persons: ${response.status}`);
  return response.json();
}

async function loadEventDossiers() {
  if (window.FRUS_EVENT_DOSSIERS) return window.FRUS_EVENT_DOSSIERS;
  const response = await fetch("data/event-dossiers.json");
  if (!response.ok) throw new Error(`Could not load event dossiers: ${response.status}`);
  return response.json();
}

async function loadCompilerGaps() {
  if (window.FRUS_COMPILER_GAPS) return window.FRUS_COMPILER_GAPS;
  const response = await fetch("data/compiler-gaps.json");
  if (!response.ok) throw new Error(`Could not load compiler gaps: ${response.status}`);
  return response.json();
}

async function loadPublicReviewMentions() {
  if (window.BUSH_PUBLIC_STATEMENT_REVIEW) return window.BUSH_PUBLIC_STATEMENT_REVIEW;
  const response = await fetch("data/public-statement-review.json");
  if (!response.ok) throw new Error(`Could not load public statement review mentions: ${response.status}`);
  return response.json();
}

async function loadScheduleReferences() {
  if (window.FRUS_SCHEDULE_REFERENCES) return window.FRUS_SCHEDULE_REFERENCES;
  const response = await fetch("data/schedule-references.json");
  if (!response.ok) throw new Error(`Could not load Daily Diary references: ${response.status}`);
  return response.json();
}

async function init() {
  try {
    const publicStatementPromise = publicStatementsRoot ? loadPublicStatements() : Promise.resolve([]);
    const personsPromise = personsRoot ? loadPersons() : Promise.resolve([]);
    const eventDossierPromise = eventDossiersRoot ? loadEventDossiers() : Promise.resolve([]);
    const compilerGapPromise = compilerGapsRoot ? loadCompilerGaps() : Promise.resolve([]);
    const publicReviewPromise = publicMentionsRoot ? loadPublicReviewMentions() : Promise.resolve([]);
    const scheduleReferencePromise = totalScheduleReferences ? loadScheduleReferences() : Promise.resolve([]);
    [allRecords, allPublicStatements, allPersons, allEventDossiers, allCompilerGaps, allPublicReviewMentions, allScheduleReferences] = await Promise.all([
      window.FRUS_RECORDS || loadRecords(),
      publicStatementPromise,
      personsPromise,
      eventDossierPromise,
      compilerGapPromise,
      publicReviewPromise,
      scheduleReferencePromise
    ]);
    setWorkbenchOptions(allRecords);
    setReferenceOptions(allPublicStatements);
    setPersonOptions(allPersons);
    setGapOptions(allCompilerGaps);
    setMentionOptions(allPublicReviewMentions);
    setPublicStatementCount(allPublicStatements);
    setPersonsCount(allPersons);
    setEventDossierCount(allEventDossiers);
    setCompilerGapCount(allCompilerGaps);
    setScheduleReferenceCount(allScheduleReferences);
    bindWorkbench();
    bindReferenceWorkbench();
    bindPersonWorkbench();
    bindGapWorkbench();
    bindMentionWorkbench();
    renderEventDossiers(allEventDossiers);
    applyFilters();
    applyReferenceFilters();
    applyPersonFilters();
    applyGapFilters();
    applyMentionFilters();
    enableChapterCards();
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  } catch (error) {
    recordsRoot.innerHTML = '<p class="error">The records could not be loaded. Try opening this site through a local server or GitHub Pages.</p>';
    if (publicStatementsRoot) {
      publicStatementsRoot.innerHTML = '<p class="error">The public statement references could not be loaded.</p>';
    }
    if (personsRoot) {
      personsRoot.innerHTML = '<li class="error">The persons list could not be loaded.</li>';
    }
    if (compilerGapsRoot) {
      compilerGapsRoot.innerHTML = '<p class="error">The compiler gap data could not be loaded.</p>';
    }
    if (publicMentionsRoot) {
      publicMentionsRoot.innerHTML = '<p class="error">The Public Papers review queue could not be loaded.</p>';
    }
  }
}

init();
