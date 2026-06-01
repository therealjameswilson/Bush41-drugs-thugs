(function () {
  function downloadTextFile(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function selectedChronologyFilters() {
    const filters = selectedFilters();
    return [
      filters.query ? `search=${filters.query}` : "",
      filters.chapter ? `chapter=${filters.chapter}` : "",
      filters.type ? `type=${filters.type}` : "",
      filters.year ? `year=${filters.year}` : "",
      filters.source ? `source=${filters.source}` : "",
      filters.confidence ? `match=${filters.confidence}` : "",
      filters.review ? `review=${filters.review}` : "",
      filters.selection ? `selection=${filters.selection}` : "",
      filters.note ? `note=${filters.note}` : "",
      sortSelect?.value ? `sort=${sortSelect.value}` : ""
    ].filter(Boolean).join("; ") || "all declassified memcons/telcons";
  }

  function packetSelectionLabel(record) {
    return typeof selectionLabel === "function" ? selectionLabel(record) : "Unassigned";
  }

  function packetSelectionSummary(records) {
    const counts = records.reduce((totals, record) => {
      const label = packetSelectionLabel(record).toLowerCase();
      totals[label] = (totals[label] || 0) + 1;
      return totals;
    }, {});
    return [
      `include ${counts.include || 0}`,
      `maybe ${counts.maybe || 0}`,
      `exclude ${counts.exclude || 0}`,
      `unassigned ${counts.unassigned || 0}`
    ].join("; ");
  }

  function packetCompilerNote(record) {
    return typeof compilerNote === "function" ? compilerNote(record) : "";
  }

  function packetPageTotal(records) {
    return records.reduce((total, record) => total + (Number(record.pageCount) || 0), 0);
  }

  function packetStateCount(records, state) {
    return records.filter((record) => {
      const selection = packetSelectionLabel(record).toLowerCase();
      return state === "unassigned" ? selection === "unassigned" : selection === state;
    });
  }

  function packetSelectionCoverage(records) {
    return CHAPTER_ORDER
      .map((chapterName, chapterIndex) => {
        const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
        if (!chapterRecords.length) return "";
        const include = packetStateCount(chapterRecords, "include");
        const maybe = packetStateCount(chapterRecords, "maybe");
        const exclude = packetStateCount(chapterRecords, "exclude");
        const unassigned = packetStateCount(chapterRecords, "unassigned");
        return `- Chapter ${chapterIndex + 1}: ${chapterName}: include ${include.length} (${packetPageTotal(include)} pages); maybe ${maybe.length}; exclude ${exclude.length}; unassigned ${unassigned.length}; notes ${chapterRecords.filter((record) => packetCompilerNote(record)).length}`;
      })
      .filter(Boolean)
      .join("\n");
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
      `- Selection: ${packetSelectionLabel(record)}`,
      `- Compiler note: ${packetCompilerNote(record) || "none"}`,
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
    const lines = [
      "# FRUS Volume XXVIII Declassified Chronology Packet",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Visible records: ${records.length}`,
      `Selection summary: ${packetSelectionSummary(records)}`,
      `Compiler notes: ${records.filter((record) => packetCompilerNote(record)).length}`,
      `Filters: ${selectedChronologyFilters()}`,
      "",
      "Scope: declassified presidential memoranda of conversation and telephone conversations with online PDFs. Daily Diary/Backup entries are same-day schedule-control references, not substitute conversation transcripts.",
      ""
    ];

    const coverage = packetSelectionCoverage(records);
    if (coverage) lines.push("## Selection Coverage", "", coverage, "");

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
    downloadTextFile(
      "frus-v28-visible-compiler-packet.md",
      compilerPacket(visibleRecords),
      "text/markdown;charset=utf-8"
    );
  }

  window.FRUS_PACKET_EXPORT = { compilerPacket, exportCompilerPacket };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#export-packet")?.addEventListener("click", exportCompilerPacket);
  });
})();
