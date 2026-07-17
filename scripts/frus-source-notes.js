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
  if (/Records of the Domestic Policy Council/i.test(title)) {
    return "Bush Presidential Records, Domestic Policy Council";
  }
  if (/Records of the White House Office of Cabinet Affairs/i.test(title)) {
    return "Bush Presidential Records, White House Office of Cabinet Affairs";
  }
  if (/Records of the National Security Affairs Office in the Office of the Vice President/i.test(title)) {
    return "Bush Vice Presidential Records, Office of National Security Affairs";
  }
  if (/Records of the White House Office of Counsel to the President/i.test(title)) {
    return "Bush Presidential Records, White House Office of Counsel to the President";
  }
  if (/Records of the First Lady's Office of Scheduling/i.test(title)) {
    return "Bush Presidential Records, First Lady's Office of Scheduling";
  }
  if (/Records of the White House Social Office/i.test(title)) {
    return "Bush Presidential Records, White House Social Office";
  }
  if (/Records of the White House Office of Policy Development/i.test(title)) {
    return "Bush Presidential Records, White House Office of Policy Development";
  }
  if (/Records of the Office of Domestic Policy and the Council on Competitiveness/i.test(title)) {
    return "Bush Presidential Records, Office of Domestic Policy and Council on Competitiveness";
  }
  if (/Records of the White House Office of Press Secretary/i.test(title)) {
    return "Bush Presidential Records, White House Office of Press Secretary";
  }
  return title;
}

function normalizeSeriesTitle(value) {
  return clean(value)
    .replace(/^COS:\s*/i, "")
    .replace(/^H-Files - National Security Council \(NSC\)\/Deputies Committee \(DC\) Meetings Files$/i, "H-Files, NSC/DC Meetings Files")
    .replace(/^H-Files - National Security Council \(NSC\)\/Deputies Committee \(DC\) Meetings Follow-Up Files$/i, "H-Files, NSC/DC Meeting Follow-Up Files")
    .replace(/^H-Files - National Security Council \(NSC\)\/Deputies Committee \(DC\) Meetings Follow-up Files$/i, "H-Files, NSC/DC Meeting Follow-Up Files")
    .replace(/^H-Files - National Security Council \(NSC\) Meeting Files$/i, "H-Files, NSC Meeting Files")
    .replace(/^H-Files - National Security Review \(NSR\) Files$/i, "H-Files, NSR Files")
    .replace(/^H-Files - National Security Review Files$/i, "H-Files, NSR Files")
    .replace(/^H-Files - National Security Directive Files$/i, "H-Files, NSD Files")
    .replace(/^NSC\/DC Meetings$/i, "H-Files, NSC/DC Meetings Files")
    .replace(/^NSC\/DC Follow-Up$/i, "H-Files, NSC/DC Meeting Follow-Up Files");
}

function normalizeFolderTitle(value) {
  return clean(value).replace(/\]\[/g, "] [");
}

function stripSourceNoteAuditStatus(value) {
  return clean(value)
    .replace(/\s+Listed in the National Archives Catalog; no online declassified PDF identified\.?$/i, "")
    .replace(/\s+Online PDF available through the National Archives Catalog; original classification not verified\.?$/i, "");
}

function normalizeExistingFrusSourceNote(value) {
  let note = stripSourceNoteAuditStatus(value);
  const collectionPatterns = [
    [/Source: George H\.W\. Bush Library, Records of the Domestic Policy Council \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, Domestic Policy Council,"],
    [/Source: George H\.W\. Bush Library, Records of the White House Office of Cabinet Affairs \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, White House Office of Cabinet Affairs,"],
    [/Source: George H\.W\. Bush Library, Records of the National Security Affairs Office in the Office of the Vice President \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Vice Presidential Records, Office of National Security Affairs,"],
    [/Source: George H\.W\. Bush Library, Records of the White House Office of Counsel to the President \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, White House Office of Counsel to the President,"],
    [/Source: George H\.W\. Bush Library, Records of the First Lady's Office of Scheduling \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, First Lady's Office of Scheduling,"],
    [/Source: George H\.W\. Bush Library, Records of the White House Social Office \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, White House Social Office,"],
    [/Source: George H\.W\. Bush Library, Records of the White House Office of Policy Development \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, White House Office of Policy Development,"],
    [/Source: George H\.W\. Bush Library, Records of the Office of Domestic Policy and the Council on Competitiveness \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, Office of Domestic Policy and Council on Competitiveness,"],
    [/Source: George H\.W\. Bush Library, Records of the White House Office of Press Secretary \(George H\. W\. Bush Administration\),/gi, "Source: George H.W. Bush Library, Bush Presidential Records, White House Office of Press Secretary,"]
  ];
  for (const [pattern, replacement] of collectionPatterns) note = note.replace(pattern, replacement);
  return normalizeFolderTitle(note);
}

function sourceCollectionFromFrusSourceNote(value) {
  const body = clean(value).replace(/^Source: George H\.W\. Bush Library,\s*/i, "");
  const knownCollections = [
    "Bush Presidential Records, National Security Council",
    "Bush Presidential Records, White House Office of Records Management",
    "Bush Presidential Records, White House Office of the Chief of Staff",
    "Bush Presidential Records, Council of Economic Advisors",
    "Bush Presidential Records, Domestic Policy Council",
    "Bush Presidential Records, White House Office of Cabinet Affairs",
    "Bush Vice Presidential Records, Office of National Security Affairs",
    "Bush Presidential Records, White House Office of Counsel to the President",
    "Bush Presidential Records, First Lady's Office of Scheduling",
    "Bush Presidential Records, White House Social Office",
    "Bush Presidential Records, White House Office of Policy Development",
    "Bush Presidential Records, Office of Domestic Policy and Council on Competitiveness",
    "Bush Presidential Records, White House Office of Press Secretary",
    "Richard Cheney Collection"
  ];
  return knownCollections.find((collection) => body.startsWith(collection)) || body.split(", ")[0] || "";
}

function sourceFolderFromFrusSourceNote(value) {
  const withoutStatus = stripSourceNoteAuditStatus(value)
    .replace(/\.\s+(Top Secret|Secret|Confidential|Unclassified).*$/i, "")
    .replace(/\.$/, "");
  const body = withoutStatus.replace(/^Source: George H\.W\. Bush Library,\s*/i, "");
  const parts = body.split(", ").filter(Boolean);
  const oaIndex = parts.findIndex((part) => /^OA\/ID\s+/i.test(part));
  if (oaIndex >= 0) return normalizeFolderTitle(parts.slice(oaIndex + 1).join(", "));
  return normalizeFolderTitle(parts.slice(-1)[0] || "");
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
    normalizeFolderTitle(folderTitle)
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
  const existingFrusNote = clean(record.frusSourceNote || record.sourceNote);
  if (/^Source: George H\.?W\. Bush Library/i.test(existingFrusNote) && record.catalogTrail) {
    const sourceNote = normalizeExistingFrusSourceNote(existingFrusNote);
    return {
      sourceNote,
      sourceCollection: sourceCollectionFromFrusSourceNote(sourceNote),
      sourceFolder: sourceFolderFromFrusSourceNote(sourceNote),
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

  return {
    sourceNote: buildFrusStyleSourceNote({
      collectionTitle,
      seriesTitle,
      folderTitle: record.documentTitle || record.title,
      localIdentifier: record.localIdentifier,
      classificationMarking: record.pdfExtract?.classificationMarking || ""
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
