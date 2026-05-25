function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function trimTerminalPeriod(value) {
  return clean(value).replace(/\.$/, "");
}

function normalizeCollectionTitle(value) {
  const title = clean(value);
  if (/Records of the National Security Council/i.test(title)) {
    return "Bush Presidential Records, National Security Council";
  }
  if (/Records of the White House Office of Records Management/i.test(title)) {
    return "Bush Presidential Records, White House Office of Records Management";
  }
  if (/Records of the White House Office of the Chief of Staff/i.test(title)) {
    return "Bush Presidential Records, White House Office of the Chief of Staff";
  }
  if (/Records of the Council of Economic Advisors/i.test(title)) {
    return "Bush Presidential Records, Council of Economic Advisors";
  }
  return title;
}

function normalizeSeriesTitle(value) {
  return clean(value)
    .replace(/^H-Files - National Security Council \(NSC\)\/Deputies Committee \(DC\) Meetings Files$/i, "H-Files, NSC/DC Meetings Files")
    .replace(/^H-Files - National Security Council \(NSC\)\/Deputies Committee \(DC\) Meetings Follow-Up Files$/i, "H-Files, NSC/DC Meeting Follow-Up Files")
    .replace(/^H-Files - National Security Council \(NSC\) Meeting Files$/i, "H-Files, NSC Meeting Files")
    .replace(/^H-Files - National Security Review Files$/i, "H-Files, NSR Files")
    .replace(/^H-Files - National Security Directive Files$/i, "H-Files, NSD Files");
}

function collectionTitleFromCatalogNote(sourceNote) {
  const match = clean(sourceNote).match(/Source: National Archives Catalog, (.*?), Presidential (?:Memcon|Telcon) Files,/);
  return match?.[1] || "Records of the National Security Council (George H. W. Bush Administration)";
}

function collectionTitleFromAnyCatalogNote(sourceNote, seriesTitle) {
  const note = clean(sourceNote);
  const series = clean(seriesTitle);
  if (series) {
    const escapedSeries = series.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = note.match(new RegExp(`Source: National Archives Catalog, (.*?), ${escapedSeries},`));
    if (match) return match[1];
  }
  const fallback = note.match(/Source: National Archives Catalog, (.*?), [^,]+, (?:\d{5}[-–]\d{3}, )?NAID \d+/);
  return fallback?.[1] || "";
}

function folderTitleFromCatalogNote(sourceNote, seriesTitle) {
  const note = clean(sourceNote);
  const escapedSeries = seriesTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = note.match(new RegExp(`${escapedSeries}, (.*?), NAID \\d+`));
  return trimTerminalPeriod(match?.[1] || "");
}

function fieldFromCatalogNote(sourceNote, label) {
  const note = clean(sourceNote);
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextLabel =
    "(?:\\. Catalog URL:|\\. Series URL:|\\. Collection URL:|\\. Folder URL:|\\. Digital object:|\\. Approximate pages:|\\. FOIA tracking:|\\. Other finding aid identifier:|\\. Extent:|\\. Container:|\\. Catalog subjects:|\\. Access restriction:|$)";
  const match = note.match(new RegExp(`${escapedLabel}: (.*?)${nextLabel}`));
  return trimTerminalPeriod(match?.[1] || "");
}

function digitalObjectFromCatalogNote(sourceNote) {
  const digital = fieldFromCatalogNote(sourceNote, "Digital object");
  if (!digital) return {};
  const match = digital.match(/([^,]+), object ID ([^,]+), URL (.+)$/);
  if (!match) return {};
  return {
    objectFilename: match[1],
    objectId: match[2],
    objectUrl: match[3]
  };
}

function catalogSubjectsFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Catalog subjects");
}

function accessRestrictionFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Access restriction");
}

function seriesUrlFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Series URL");
}

function collectionUrlFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Collection URL");
}

function foiaTrackingFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "FOIA tracking");
}

function otherFindingAidFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Other finding aid identifier");
}

function extentFromNote(sourceNote) {
  return fieldFromCatalogNote(sourceNote, "Extent");
}

function buildFrusSourceNote({ collectionTitle, seriesTitle, folderTitle, naid, accessRestriction }) {
  const pathParts = [
    "Source: George H.W. Bush Library",
    normalizeCollectionTitle(collectionTitle),
    normalizeSeriesTitle(seriesTitle),
    folderTitle
  ].filter(Boolean);

  const note = [
    `${pathParts.join(", ")}${naid ? `, NAID ${naid}` : ""}.`,
    accessRestriction ? `Access restriction: ${accessRestriction}.` : ""
  ];

  return note.filter(Boolean).join(" ");
}

function buildFrusStyleSourceNote({
  collectionTitle,
  seriesTitle,
  folderTitle,
  localIdentifier,
  classificationMarking,
  statusNote
}) {
  const pathParts = [
    "Source: George H.W. Bush Library",
    normalizeCollectionTitle(collectionTitle),
    normalizeSeriesTitle(seriesTitle),
    localIdentifier ? `OA/ID ${localIdentifier}` : "",
    folderTitle
  ].filter(Boolean);

  return [
    `${pathParts.join(", ")}.`,
    classificationMarking ? `${classificationMarking}.` : "",
    statusNote || ""
  ].filter(Boolean).join(" ");
}

function buildCatalogTrail({
  catalogUrl,
  collectionUrl,
  seriesUrl,
  folderUrl,
  objectFilename,
  objectId,
  objectUrl,
  catalogSubjects,
  accessRestriction
}) {
  return [
    catalogUrl ? `Catalog URL: ${catalogUrl}.` : "",
    collectionUrl ? `Collection URL: ${collectionUrl}.` : "",
    seriesUrl ? `Series URL: ${seriesUrl}.` : "",
    folderUrl ? `Folder URL: ${folderUrl}.` : "",
    objectFilename || objectUrl
      ? `Digital object: ${[objectFilename, objectId ? `object ID ${objectId}` : "", objectUrl ? `URL ${objectUrl}` : ""].filter(Boolean).join(", ")}.`
      : "",
    catalogSubjects ? `Catalog subjects: ${catalogSubjects}.` : "",
    accessRestriction ? `Access restriction: ${accessRestriction}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function notesFromCatalogRecord(record, series, object) {
  const collection = (record.ancestors || []).find((item) => item.levelOfDescription === "collection");
  const folder = (record.ancestors || []).find((item) => item.levelOfDescription === "fileUnit");
  const catalogSubjects = (record.subjects || []).map((subject) => subject.heading).filter(Boolean).join(", ");
  const accessRestriction = record.accessRestriction?.status || "";
  const catalogUrl = `https://catalog.archives.gov/id/${record.naId}`;
  const seriesUrl = `https://catalog.archives.gov/id/${series.naid}`;
  const folderUrl = folder?.naId ? `https://catalog.archives.gov/id/${folder.naId}` : "";

  return {
    sourceNote: buildFrusStyleSourceNote({
      collectionTitle: collection?.title || "Records of the National Security Council (George H. W. Bush Administration)",
      seriesTitle: series.title,
      folderTitle: folder?.title || "",
      localIdentifier: record.localIdentifier || "",
      classificationMarking: ""
    }),
    catalogTrail: buildCatalogTrail({
      catalogUrl,
      seriesUrl,
      folderUrl,
      objectFilename: object?.objectFilename || "",
      objectId: object?.objectId || "",
      objectUrl: object?.objectUrl || "",
      catalogSubjects,
      accessRestriction
    })
  };
}

function notesFromSiteRecord(record) {
  const legacyNote = clean(record.sourceNote);
  const source = record.source || {};
  const seriesTitle =
    source.title || source.shortName || (record.documentType === "Telcon" ? "Presidential Telcon Files" : "Presidential Memcon Files");
  const object = digitalObjectFromCatalogNote(legacyNote);
  const catalogUrl = fieldFromCatalogNote(legacyNote, "Catalog URL") || record.catalogUrl;
  const seriesUrl = fieldFromCatalogNote(legacyNote, "Series URL") || source.url;
  const folderUrl = fieldFromCatalogNote(legacyNote, "Folder URL");
  const accessRestriction = accessRestrictionFromNote(legacyNote) || record.accessRestrictionStatus;
  const catalogSubjects = catalogSubjectsFromNote(legacyNote);
  const collectionTitle = record.sourceCollection || collectionTitleFromCatalogNote(legacyNote);
  const folderTitle = record.sourceFolder || folderTitleFromCatalogNote(legacyNote, seriesTitle);
  const classificationMarking = record.pdfExtract?.classificationMarking || "";

  return {
    sourceNote: buildFrusStyleSourceNote({
      collectionTitle,
      seriesTitle,
      folderTitle,
      localIdentifier: record.localIdentifier,
      classificationMarking
    }),
    sourceCollection: normalizeCollectionTitle(collectionTitle),
    sourceFolder: folderTitle,
    catalogTrail: buildCatalogTrail({
      catalogUrl,
      seriesUrl,
      folderUrl,
      objectFilename: object.objectFilename || record.objectFilename,
      objectId: object.objectId,
      objectUrl: object.objectUrl || record.pdfUrl,
      catalogSubjects,
      accessRestriction
    })
  };
}

function notesFromCompilerGap(record) {
  const legacyNote = clean(record.sourceNote);
  if (/^Source: George H\.?W\. Bush Library/i.test(legacyNote) && record.catalogTrail) {
    return {
      sourceNote: legacyNote,
      catalogTrail: record.catalogTrail
    };
  }
  const source = record.source || {};
  const seriesTitle = source.title || record.sourceName || source.shortName || "";
  const collectionTitle = collectionTitleFromAnyCatalogNote(legacyNote, seriesTitle);
  const object = digitalObjectFromCatalogNote(legacyNote);
  const accessRestriction = accessRestrictionFromNote(legacyNote) || record.accessRestrictionStatus;
  const catalogUrl = fieldFromCatalogNote(legacyNote, "Catalog URL") || record.catalogUrl;
  const seriesUrl = seriesUrlFromNote(legacyNote) || source.url;
  const collectionUrl = collectionUrlFromNote(legacyNote);
  const statusNote = record.pdfUrl
    ? "Online PDF available through the National Archives Catalog; original classification not verified."
    : "Listed in the National Archives Catalog; no online declassified PDF identified.";

  return {
    sourceNote: buildFrusStyleSourceNote({
      collectionTitle,
      seriesTitle,
      folderTitle: record.documentTitle || record.title,
      localIdentifier: record.localIdentifier,
      classificationMarking: record.pdfExtract?.classificationMarking || "",
      statusNote
    }),
    sourceCollection: normalizeCollectionTitle(collectionTitle),
    sourceFolder: record.documentTitle || record.title,
    catalogTrail: buildCatalogTrail({
      catalogUrl,
      collectionUrl,
      seriesUrl,
      objectFilename: object.objectFilename || record.objectFilename,
      objectId: object.objectId,
      objectUrl: object.objectUrl || record.pdfUrl,
      catalogSubjects: [
        foiaTrackingFromNote(legacyNote) ? `FOIA ${foiaTrackingFromNote(legacyNote)}` : "",
        otherFindingAidFromNote(legacyNote) ? `Finding aid ${otherFindingAidFromNote(legacyNote)}` : "",
        extentFromNote(legacyNote) ? `Extent ${extentFromNote(legacyNote)}` : ""
      ].filter(Boolean).join("; "),
      accessRestriction
    })
  };
}

module.exports = {
  notesFromCatalogRecord,
  notesFromSiteRecord,
  notesFromCompilerGap
};
