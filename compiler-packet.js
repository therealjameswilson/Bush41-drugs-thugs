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
      filters.pdfCheck ? `pdf check=${filters.pdfCheck}` : "",
      filters.event ? `event=${filters.event}` : "",
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

  function packetEventDossiers(record) {
    return typeof recordEventTitles === "function" ? recordEventTitles(record) : [];
  }

  function packetPageTotal(records) {
    return records.reduce((total, record) => total + (Number(record.pageCount) || 0), 0);
  }

  function packetPdfVerificationIssues(record) {
    if (typeof pdfVerificationLabels === "function") return pdfVerificationLabels(record);
    return [
      record.pdfExtract?.subject ? "" : "Missing subject",
      record.pdfExtract?.participants ? "" : "Missing participants",
      record.pdfExtract?.dateTimePlace ? "" : "Missing date/time/place",
      record.pdfExtract?.classificationMarking ? "" : "Missing classification"
    ].filter(Boolean);
  }

  function packetPdfVerificationQueue(records) {
    return records.filter((record) => packetPdfVerificationIssues(record).length);
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

  function outlineSort(records) {
    return [...records].sort((a, b) => (
      a.chapter.number - b.chapter.number ||
      a.sortDate.localeCompare(b.sortDate) ||
      (a.documentTitle || a.title).localeCompare(b.documentTitle || b.title)
    ));
  }

  function selectionKey(record) {
    return packetSelectionLabel(record).toLowerCase();
  }

  function outlineRecordBlock(record, documentNumber) {
    return [
      `### Document ${documentNumber}. ${record.date} - ${record.documentTitle || record.title}`,
      "",
      `- Type: ${record.documentType}`,
      `- Pages: ${record.pageCount || "unmeasured"}${record.pageCountBasis ? ` (${record.pageCountBasis})` : ""}`,
      `- Event dossiers: ${packetEventDossiers(record).join("; ") || "none matched"}`,
      `- Source note draft: ${frusSourceNote(record)}`,
      `- Compiler note: ${packetCompilerNote(record) || "none"}`,
      `- PDF verification: ${pdfVerificationSummary(record)}`,
      `- Daily Diary/Backup controls: ${scheduleReferenceSummary(record) || "none matched"}`,
      `- PDF: ${record.pdfUrl || "not available"}`,
      `- Catalog: ${record.catalogUrl || "not listed"}`,
      ""
    ].join("\n");
  }

  function outlineReserveLine(record) {
    return [
      `- ${record.date} - ${record.documentTitle || record.title}`,
      `  - ${record.documentType}; ${record.pageCount || "?"} pages; ${packetSelectionLabel(record)}`,
      `  - Event dossiers: ${packetEventDossiers(record).join("; ") || "none matched"}`,
      `  - Note: ${packetCompilerNote(record) || "none"}`,
      `  - PDF: ${record.pdfUrl || "not available"}`
    ].join("\n");
  }

  function outlineGapLine(record) {
    return [
      `- ${record.date || "No date"} - ${record.title}`,
      `  - ${record.category || "Gap"}; priority ${record.priority || "Review"}; pages ${record.pageCount || "unknown"}`,
      `  - Why: ${record.why || "Compiler review needed."}`,
      `  - Catalog: ${record.catalogUrl || "not listed"}`
    ].join("\n");
  }

  function selectedOutline(records, gaps = []) {
    const allSelectedRecords = outlineSort(records);
    const includeRecords = allSelectedRecords.filter((record) => selectionKey(record) === "include");
    const maybeRecords = allSelectedRecords.filter((record) => selectionKey(record) === "maybe");
    const highGaps = gaps.filter((record) => record.priority === "High");
    const strongUnassigned = allSelectedRecords
      .filter((record) => selectionKey(record) === "unassigned" && confidence(record).value === "strong")
      .sort(byConfidence)
      .slice(0, 12);

    const lines = [
      "# FRUS Volume XXVIII Draft Selection Outline",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Included records: ${includeRecords.length}`,
      `Included page total: ${packetPageTotal(includeRecords)}`,
      `Maybe records: ${maybeRecords.length}`,
      `Included records needing PDF verification: ${packetPdfVerificationQueue(includeRecords).length}`,
      `High-priority gap reminders: ${highGaps.length}`,
      "",
      "Use: working document numbers below are generated from local Include selections in chapter chronology order. Verify final numbering, source notes, excisions, and chapter balance before drafting.",
      ""
    ];

    let documentNumber = 1;
    for (const chapterName of CHAPTER_ORDER) {
      const chapterNumber = CHAPTER_ORDER.indexOf(chapterName) + 1;
      const chapterIncludes = includeRecords.filter((record) => record.chapter.name === chapterName);
      const chapterMaybes = maybeRecords.filter((record) => record.chapter.name === chapterName);
      const chapterGaps = highGaps.filter((record) => record.chapter?.name === chapterName);

      lines.push(`## Chapter ${chapterNumber}: ${chapterName}`, "");
      lines.push(`Include: ${chapterIncludes.length} records, ${packetPageTotal(chapterIncludes)} pages. Maybe: ${chapterMaybes.length}. Include PDF checks: ${packetPdfVerificationQueue(chapterIncludes).length}. High-priority gaps: ${chapterGaps.length}.`, "");

      if (chapterIncludes.length) {
        lines.push("### Proposed Document Sequence", "");
        for (const record of chapterIncludes) {
          lines.push(outlineRecordBlock(record, documentNumber));
          documentNumber += 1;
        }
      } else {
        lines.push("No records are marked Include for this chapter.", "");
      }

      if (chapterMaybes.length) {
        lines.push("### Reserve Maybe Records", "");
        for (const record of chapterMaybes.slice(0, 12)) lines.push(outlineReserveLine(record), "");
        if (chapterMaybes.length > 12) lines.push(`Additional maybe records not shown here: ${chapterMaybes.length - 12}.`, "");
      }

      if (chapterGaps.length) {
        lines.push("### High-Priority Gap Reminders", "");
        for (const record of chapterGaps.slice(0, 10)) lines.push(outlineGapLine(record), "");
        if (chapterGaps.length > 10) lines.push(`Additional high-priority gaps in the Gaps workbench: ${chapterGaps.length - 10}.`, "");
      }
    }

    if (strongUnassigned.length) {
      lines.push("## Strong Unassigned Leads", "");
      for (const record of strongUnassigned) lines.push(outlineReserveLine(record), "");
    }

    lines.push("## Editorial Checks Before Drafting", "");
    lines.push("- Reconcile Include selections against high-priority gap reminders before treating this as a final document list.");
    lines.push("- Confirm dates, participants, classification markings, drafting/distribution data, and excisions directly in each PDF.");
    lines.push("- Use Public Papers references as public-positioning context, not substitutes for private conversation records.");
    lines.push("- Preserve Catalog URLs and NAIDs in the research trail, but keep final source notes in FRUS style.");
    return lines.join("\n");
  }

  function pdfVerificationSummary(record) {
    const issues = packetPdfVerificationIssues(record);
    const details = [
      record.pdfExtract?.classificationMarking ? `classification: ${record.pdfExtract.classificationMarking}` : "",
      record.pdfExtract?.dateTimePlace ? `date/time/place: ${record.pdfExtract.dateTimePlace}` : "",
      record.pdfExtract?.participants ? `participants: ${record.pdfExtract.participants}` : "",
      record.pdfExtract?.subject ? `subject: ${record.pdfExtract.subject}` : "",
      record.sourceConfidence?.basis ? `source confidence: ${record.sourceConfidence.basis}` : ""
    ].filter(Boolean);
    if (issues.length) return `Needs PDF verification: ${issues.join("; ")}${details.length ? `. Parsed: ${details.join("; ")}` : ""}`;
    return `Complete first-page metadata: ${details.join("; ") || "all required fields parsed"}`;
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
      `- Event dossiers: ${packetEventDossiers(record).join("; ") || "none matched"}`,
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
      `PDF verification queue: ${packetPdfVerificationQueue(records).length}`,
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

  function pdfVerificationChecklist(records) {
    const queue = packetPdfVerificationQueue(records);
    const lines = [
      "# FRUS Volume XXVIII PDF Verification Checklist",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Visible records: ${records.length}`,
      `Records needing first-page PDF verification: ${queue.length}`,
      `Filters: ${selectedChronologyFilters()}`,
      "",
      "Use: verify the listed source-note fields directly in the online PDF before relying on the draft FRUS source note.",
      ""
    ];

    for (const chapterName of CHAPTER_ORDER) {
      const chapterRecords = queue.filter((record) => record.chapter.name === chapterName);
      if (!chapterRecords.length) continue;
      lines.push(`## Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`, "");
      for (const record of chapterRecords) {
        lines.push(
          `### ${record.date} - ${record.documentTitle || record.title}`,
          "",
          `- Missing: ${packetPdfVerificationIssues(record).join("; ")}`,
          `- Selection: ${packetSelectionLabel(record)}`,
          `- Pages: ${record.pageCount || "unmeasured"}${record.pageCountBasis ? ` (${record.pageCountBasis})` : ""}`,
          `- Event dossiers: ${packetEventDossiers(record).join("; ") || "none matched"}`,
          `- Source note draft: ${frusSourceNote(record)}`,
          `- Parsed PDF metadata: ${pdfVerificationSummary(record)}`,
          `- Daily Diary/Backup controls: ${scheduleReferenceSummary(record) || "none matched"}`,
          `- PDF: ${record.pdfUrl || "not available"}`,
          `- Catalog: ${record.catalogUrl || "not listed"}`,
          ""
        );
      }
    }

    if (!queue.length) {
      lines.push("No visible records are missing subject, participants, date/time/place, or classification metadata.", "");
    }

    lines.push("## Final Source-Note Pass", "");
    lines.push("- Confirm exact dateline, participants, classification markings, drafting/distribution data, excisions, and any attached tabs or distribution markings directly in each PDF.");
    lines.push("- Reconcile the source note draft against the published FRUS style before moving the record into the final manuscript.");
    return lines.join("\n");
  }

  function exportCompilerPacket() {
    downloadTextFile(
      "frus-v28-visible-compiler-packet.md",
      compilerPacket(visibleRecords),
      "text/markdown;charset=utf-8"
    );
  }

  function exportSelectedOutline() {
    downloadTextFile(
      "frus-v28-selected-outline.md",
      selectedOutline(allRecords, typeof allCompilerGaps === "undefined" ? [] : allCompilerGaps),
      "text/markdown;charset=utf-8"
    );
  }

  function exportPdfVerificationChecklist() {
    downloadTextFile(
      "frus-v28-visible-pdf-verification-checklist.md",
      pdfVerificationChecklist(visibleRecords),
      "text/markdown;charset=utf-8"
    );
  }

  window.FRUS_PACKET_EXPORT = {
    compilerPacket,
    exportCompilerPacket,
    selectedOutline,
    exportSelectedOutline,
    pdfVerificationChecklist,
    exportPdfVerificationChecklist
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#export-packet")?.addEventListener("click", exportCompilerPacket);
    document.querySelector("#export-outline")?.addEventListener("click", exportSelectedOutline);
    document.querySelector("#export-pdf-checklist")?.addEventListener("click", exportPdfVerificationChecklist);
  });
})();
