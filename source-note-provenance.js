(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FrusSourceNoteProvenance = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  const PUBLISHED_STANDARD_URL = "https://history.state.gov/historicaldocuments/frus1989-92v31/d216";
  const PUBLISHED_MODEL_SOURCE_NOTE = "Source: George H.W. Bush Library, Bush Presidential Records, National Security Council, Presidential Accession File, OA/ID CF01664, 9103951. Secret.";
  const LOCATOR_LEAK_PATTERN = /https?:\/\/|\bNAID\b|National Archives Catalog|Catalog URL|Digital object|object ID/i;
  const REPOSITORY_PATTERN = /^Source: George H\.W\. Bush Library,\s*/;
  const CONTROL_PATTERN = /\b(?:OA\/ID|Box|Lot|Accession(?:\s+#)?|Entry)\b|\b(?:89|90|91|92)\d{5}\b/i;
  const CLASSIFICATION_PATTERN = /\b(?:Top Secret|Secret|Confidential|Unclassified)\b/i;
  const CONTROL_NUMBER_EXCLUSIONS = new Set([
    "1012",
    "11141",
    "12356",
    "12958",
    "13292",
    "13526",
    "1989",
    "1990",
    "1991",
    "1992",
    "20506",
    "2958"
  ]);

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  // Each row is verified against the Bush Library citation marker appended to the
  // digitized item; the OA/ID and folder ID on that marker do not identify the item.
  const SCAN_REVIEW = Object.freeze({
  "428080173": [
    "325592635",
    "CF01731",
    "CF01731-008",
    3,
    "Confidential",
    "6275"
  ],
  "428080241": [
    "325377393",
    "CF01729",
    "CF01729-009",
    9,
    "Secret",
    ""
  ],
  "428080243": [
    "325377394",
    "CF01729",
    "CF01729-010",
    6,
    "Secret",
    "6625 / ADD ON 2"
  ],
  "428080487": [
    "325377405",
    "CF01729",
    "CF01729-014",
    8,
    "Confidential",
    "1597 MEMCON"
  ],
  "428080509": [
    "325592640",
    "CF01731",
    "CF01731-013",
    4,
    "Secret",
    "0687"
  ]
});
  function scanReview(record) {
    const row = SCAN_REVIEW[String(record?.naid)];
    if (!Array.isArray(row)) return null;
    const [folderNaid, collectionOaId, folderId, markerPdfPage, originalMarking, headerLead] = row;
    return { folderNaid, collectionOaId, folderId, markerPdfPage, originalMarking, headerLead };
  }

  function reviewedRecord(record) {
    const review = scanReview(record);
    if (!review) return record;
    return { ...record, pdfExtract: { ...record.pdfExtract, classificationMarking: review.originalMarking } };
  }

  function sourceNote(record) {
    const review = scanReview(record);
    if (!review) return clean(record?.frusSourceNote || record?.sourceNote || "");
    const series = clean(record.source?.title);
    const folder = clean(record.sourceFolder);
    if (!series || !folder) return clean(record.frusSourceNote || record.sourceNote || "");
    return `Source: George H.W. Bush Library, Bush Presidential Records, National Security Council, ${series}, ${folder}, OA/ID ${review.collectionOaId}, folder ${review.folderId}. ${review.originalMarking}.`;
  }

  function hasControlLocator(note) {
    const withoutFolder = note.replace(/\bOA\/ID\s+[A-Z0-9]+(?:[-–][A-Z0-9]+)*/gi, "").replace(/\bfolder(?:\s+ID)?\s+[A-Z0-9]+(?:[-–][A-Z0-9]+)*/gi, "");
    return CONTROL_PATTERN.test(withoutFolder);
  }

  function pdfControlNumberLead(record) {
    const year = clean(record?.date).slice(2, 4);
    const snippet = clean(record?.pdfExtract?.firstPageSnippet);
    if (!/^\d{2}$/.test(year) || !snippet) return "";

    const heading = snippet.split(/MEMORANDUM OF|SUBJECT:/i)[0].slice(0, 350);
    const candidates = [...heading.matchAll(/\b\d{4,5}\b/g)]
      .map((match) => match[0])
      .filter((value) => !CONTROL_NUMBER_EXCLUSIONS.has(value));
    const candidate = candidates.at(-1);
    return candidate ? `${year}${candidate.padStart(5, "0")}` : "";
  }

  function audit(record) {
    const note = sourceNote(record);
    const hardIssues = [];
    const pendingFields = [];
    const hasRepository = REPOSITORY_PATTERN.test(note);
    const seriesTitle = clean(record?.source?.title || record?.source?.shortName);
    const fileUnitTitle = clean(record?.sourceFolder);
    const hasSeries = Boolean(seriesTitle && note.includes(seriesTitle));
    const hasFileUnit = Boolean(fileUnitTitle && note.includes(fileUnitTitle));
    const review = scanReview(record);
    // Never treat a scan-verified collection OA/ID or folder ID as an item control.
    const hasControl = !review && hasControlLocator(note);
    const hasClassification = CLASSIFICATION_PATTERN.test(note);
    const controlLead = review ? review.headerLead : pdfControlNumberLead(record);

    if (!note) hardIssues.push("Source line missing");
    if (note && !hasRepository) hardIssues.push("repository-first Source order missing");
    if (note && LOCATOR_LEAK_PATTERN.test(note)) hardIssues.push("Catalog locator leaked into Source line");
    if (!hasSeries) hardIssues.push("series provenance missing");
    if (!hasFileUnit) hardIssues.push("file-unit provenance missing");
    if (!hasControl) pendingFields.push("item-level archival control-copy locator");
    if (!hasClassification) pendingFields.push("original classification and handling markings");

    let state = "complete";
    let label = "Published-style fields complete";
    if (hardIssues.length) {
      state = "invalid";
      label = "Source line needs correction";
    } else if (!hasControl && !hasClassification) {
      state = "control-and-marking-pending";
      label = "Control locator and marking pending";
    } else if (!hasControl) {
      state = "control-pending";
      label = "Control-copy locator pending";
    } else if (!hasClassification) {
      state = "marking-pending";
      label = "Classification and handling pending";
    }

    const summaryParts = [];
    if (!hardIssues.length) summaryParts.push("Repository, records, series, and file-unit order is clean");
    if (review) summaryParts.push(`Bush Library citation marker verified on PDF p. ${review.markerPdfPage}: collection OA/ID ${review.collectionOaId}; folder ID ${review.folderId} (not item control). Original ${review.originalMarking} marking verified from the scan`);
    if (controlLead) summaryParts.push(`PDF header control lead ${controlLead}; verify before citing`);
    if (pendingFields.length) summaryParts.push(`Supply ${pendingFields.join(" and ")}`);
    if (!pendingFields.length && !hardIssues.length) summaryParts.push("Confirm against the archival control copy before publication");

    return {
      state,
      label,
      note,
      hardIssues,
      pendingFields,
      controlLead,
      hasRepository,
      hasSeries,
      hasFileUnit,
      hasControl,
      hasClassification,
      summary: `${summaryParts.join(". ")}.`
    };
  }

  function matches(record, filter) {
    const result = audit(record);
    if (!filter) return true;
    if (filter === "needs-control") return !result.hasControl;
    if (filter === "needs-marking") return !result.hasClassification;
    if (filter === "has-control-lead") return Boolean(result.controlLead);
    if (filter === "missing-control-lead") return !result.controlLead;
    return result.state === filter;
  }

  function summarize(records) {
    const results = (records || []).map(audit);
    return {
      total: results.length,
      complete: results.filter((result) => result.state === "complete").length,
      invalid: results.filter((result) => result.state === "invalid").length,
      needsControl: results.filter((result) => !result.hasControl).length,
      needsMarking: results.filter((result) => !result.hasClassification).length,
      controlLeads: results.filter((result) => result.controlLead).length
    };
  }

  return {
    PUBLISHED_STANDARD_URL,
    PUBLISHED_MODEL_SOURCE_NOTE,
    audit,
    scanReview,
    reviewedRecord,
    matches,
    pdfControlNumberLead,
    sourceNote,
    summarize
  };
});
