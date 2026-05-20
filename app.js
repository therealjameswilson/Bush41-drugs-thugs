const CHAPTER_ORDER = ["Counternarcotics", "Counterterrorism"];
const REVIEW_STORAGE_KEY = "frus-v28-reviewed-records";

const recordsRoot = document.querySelector("#records-root");
const totalRecords = document.querySelector("#total-records");
const totalPdfs = document.querySelector("#total-pdfs");
const totalReviewed = document.querySelector("#total-reviewed");
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
    record.sourceNote,
    record.objectFilename,
    getTerms(record).join(" ")
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

function applyFilters() {
  const filters = selectedFilters();
  visibleRecords = sortRecords(allRecords.filter((record) => recordMatchesFilters(record, filters)));
  renderRecords(visibleRecords);
  setChapterCounts(allRecords);
  setFilteredCount(visibleRecords, allRecords);
}

function setFilteredCount(records, all) {
  if (!filteredCount) return;
  const reviewedCount = records.filter((record) => reviewedRecords.has(record.id)).length;
  filteredCount.textContent = `Showing ${records.length} of ${all.length} records; ${reviewedCount} marked reviewed in this browser.`;
}

function createMeta(record) {
  const meta = document.createElement("div");
  meta.className = "record-meta";

  for (const value of [
    record.documentType,
    record.source?.shortName,
    record.localIdentifier,
    record.pdfUrl ? "Online PDF" : "Catalog only",
    record.pageCount ? `~${record.pageCount} pages` : "pages unmeasured",
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

function createSignalLine(record) {
  const matches = signalMatches(record);
  if (!matches.length) return null;
  const line = document.createElement("p");
  line.className = "record-signals";
  line.textContent = `Compiler flags: ${matches.map((signal) => signal.label).join("; ")}`;
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
  sourceNote.textContent = record.sourceNote || "Source note pending.";

  const terms = createTopicTerms(record);
  const signals = createSignalLine(record);
  body.append(titleLine, createMeta(record));
  if (terms) body.append(terms);
  if (signals) body.append(signals);
  body.append(sourceNote, createRecordActions(record));

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

function createEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "No records match the current filters.";
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

function resetFilters() {
  for (const control of [searchInput, chapterFilter, typeFilter, yearFilter, sourceFilter, confidenceFilter, reviewFilter]) {
    if (control) control.value = "";
  }
  if (sortSelect) sortSelect.value = "chapter-date";
  applyFilters();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
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
    "catalog_url",
    "pdf_url",
    "matched_terms",
    "compiler_flags",
    "source_note"
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
      record.catalogUrl,
      record.pdfUrl,
      [...new Set(getTerms(record))].join("; "),
      signalMatches(record).map((signal) => signal.label).join("; "),
      record.sourceNote
    ].map(csvEscape).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "frus-v28-visible-memcons-telcons.csv";
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
    `Catalog: ${record.catalogUrl || ""}`,
    `PDF: ${record.pdfUrl || ""}`,
    `Matched evidence: ${terms}`,
    `Compiler flags: ${flags}`,
    "FRUS verification: confirm Washington date/time, participants, classification, distribution/drafting data, excisions, and any cross-reference editorial notes directly in the PDF."
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
  recordsRoot.addEventListener("click", handleRecordAction);
}

async function loadRecords() {
  const response = await fetch("data/records.json");
  if (!response.ok) throw new Error(`Could not load records: ${response.status}`);
  return response.json();
}

async function init() {
  try {
    allRecords = window.FRUS_RECORDS || (await loadRecords());
    setWorkbenchOptions(allRecords);
    bindWorkbench();
    applyFilters();
    enableChapterCards();
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  } catch (error) {
    recordsRoot.innerHTML = '<p class="error">The records could not be loaded. Try opening this site through a local server or GitHub Pages.</p>';
  }
}

init();
