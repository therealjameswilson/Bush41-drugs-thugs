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
  return title;
}

function collectionTitleFromCatalogNote(sourceNote) {
  const match = clean(sourceNote).match(/Source: National Archives Catalog, (.*?), Presidential (?:Memcon|Telcon) Files,/);
  return match?.[1] || "Records of the National Security Council (George H. W. Bush Administration)";
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
    "(?:\\. Catalog URL:|\\. Series URL:|\\. Folder URL:|\\. Digital object:|\\. FOIA tracking:|\\. Other finding aid identifier:|\\. Catalog subjects:|\\. Access restriction:|$)";
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

function buildFrusSourceNote({ collectionTitle, seriesTitle, folderTitle, naid, accessRestriction }) {
  const pathParts = [
    "Source: George H.W. Bush Library",
    normalizeCollectionTitle(collectionTitle),
    seriesTitle,
    folderTitle
  ].filter(Boolean);

  const note = [
    `${pathParts.join(", ")}${naid ? `, NAID ${naid}` : ""}.`,
    "Declassified copy released through the National Archives Catalog.",
    accessRestriction ? `Access restriction: ${accessRestriction}.` : "",
    "Original classification, distribution, drafting, and place/time data require PDF verification."
  ];

  return note.filter(Boolean).join(" ");
}

function buildCatalogTrail({
  catalogUrl,
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
    sourceNote: buildFrusSourceNote({
      collectionTitle: collection?.title || "Records of the National Security Council (George H. W. Bush Administration)",
      seriesTitle: series.title,
      folderTitle: folder?.title || "",
      naid: record.naId,
      accessRestriction
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
  if (record.frusSourceNote && record.catalogTrail) {
    return {
      sourceNote: record.frusSourceNote,
      catalogTrail: record.catalogTrail
    };
  }

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

  return {
    sourceNote: buildFrusSourceNote({
      collectionTitle: collectionTitleFromCatalogNote(legacyNote),
      seriesTitle,
      folderTitle: folderTitleFromCatalogNote(legacyNote, seriesTitle),
      naid: record.naid,
      accessRestriction
    }),
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

module.exports = {
  notesFromCatalogRecord,
  notesFromSiteRecord
};
