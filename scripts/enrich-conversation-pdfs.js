const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "records.json");
const dataScriptPath = path.join(repoRoot, "data", "records.js");
const reportPath = path.join(repoRoot, "reports", "conversation-pdf-enrichment.json");
const cacheDir = path.join(repoRoot, ".cache", "conversation-pdfs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clean(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(record) {
  const suffix = path.extname(new URL(record.pdfUrl).pathname) || ".pdf";
  return `${record.naid || record.id}${suffix}`;
}

function downloadPdf(record) {
  const pdfPath = path.join(cacheDir, safeFilename(record));
  if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) return pdfPath;

  execFileSync("curl", [
    "-L",
    "--fail",
    "--retry",
    "4",
    "--retry-all-errors",
    "--silent",
    "--show-error",
    "--output",
    pdfPath,
    record.pdfUrl
  ]);

  return pdfPath;
}

function pdfPages(pdfPath) {
  const output = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const match = output.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

function firstPageText(pdfPath) {
  return execFileSync("pdftotext", ["-layout", "-f", "1", "-l", "1", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });
}

function captureBlock(lines, startPattern, endPattern) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";

  const captured = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && endPattern.test(line)) break;
    if (index > start && !line.trim() && captured.length) break;
    captured.push(line);
  }

  return clean(captured.join(" "));
}

function extractClassification(lines) {
  for (const line of lines.slice(0, 35)) {
    if (/DECLASSIFIED|Declassify|PER E\.?O\.?/i.test(line)) continue;
    const collapsed = line.toUpperCase().replace(/[^A-Z]/g, "");
    if (/TOPSECRET/.test(collapsed)) return "Top Secret";
    if (/SECRET/.test(collapsed)) return "Secret";
    if (/CONFIDENTIAL/.test(collapsed)) return "Confidential";
    if (/UNCLASSIFIED/.test(collapsed)) return "Unclassified";
  }
  return "";
}

function extractDeclassification(lines) {
  return clean(lines.filter((line) => /DECLASSIFIED|Declassify|PER E\.?O\.?|Mandatory Review|FOIA/i.test(line)).slice(0, 5).join(" "));
}

function parseFirstPage(text) {
  const rawLines = text.split(/\n/);
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const subject = captureBlock(lines, /^SUBJECT:/i, /^(PARTICIPANTS?|DATE|TIME|PLACE|DISTRIBUTION):?/i);
  const participants = captureBlock(lines, /^PARTICIPANTS?:/i, /^(DATE|TIME|PLACE|DATE,?\s*TIME|AND PLACE):?/i);
  const dateTimePlace = captureBlock(lines, /^(DATE|DATE,?\s*TIME|DATE\/TIME|TIME AND PLACE|DATE AND TIME)/i, /^(President|The President|Prime Minister|Secretary|Foreign Minister|Ambassador)\b/i);
  const classificationMarking = extractClassification(lines);
  const declassification = extractDeclassification(lines);

  return {
    extractionStatus: text.trim() ? "text extracted" : "no first-page text extracted",
    classificationMarking,
    declassification,
    subject,
    participants,
    dateTimePlace,
    firstPageSnippet: clean(text).slice(0, 1400)
  };
}

function sourceConfidence(record, extracted) {
  const missing = [];
  if (!extracted.subject) missing.push("subject");
  if (!extracted.participants) missing.push("participants");
  if (!extracted.dateTimePlace) missing.push("date/time/place");

  if (!missing.length) {
    return {
      level: "PDF-derived first-page metadata",
      basis: "Page count measured with pdfinfo; subject, participants, and date/time/place parsed from first-page PDF text."
    };
  }

  return {
    level: "Partially parsed PDF metadata",
    basis: `Page count measured with pdfinfo; first-page parser did not isolate ${missing.join(", ")}.`
  };
}

function enrichRecord(record) {
  const pdfPath = downloadPdf(record);
  const pageCount = pdfPages(pdfPath);
  const text = firstPageText(pdfPath);
  const pdfExtract = parseFirstPage(text);

  return {
    ...record,
    pageCount,
    pageCountBasis: "measured from online PDF with pdfinfo",
    pdfExtract,
    sourceConfidence: sourceConfidence(record, pdfExtract)
  };
}

function main() {
  ensureDir(cacheDir);
  const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const enriched = [];
  const failures = [];

  records.forEach((record, index) => {
    if (!record.pdfUrl) {
      failures.push({ id: record.id, naid: record.naid, title: record.title, error: "No PDF URL" });
      enriched.push(record);
      return;
    }

    try {
      const next = enrichRecord(record);
      enriched.push(next);
      console.log(`${index + 1}/${records.length}: ${next.naid} ${next.pageCount || "?"} pages`);
    } catch (error) {
      failures.push({ id: record.id, naid: record.naid, title: record.title, pdfUrl: record.pdfUrl, error: error.message });
      enriched.push({
        ...record,
        sourceConfidence: {
          level: "Catalog metadata only",
          basis: `PDF enrichment failed: ${error.message}`
        }
      });
      console.warn(`${index + 1}/${records.length}: failed ${record.naid}: ${error.message}`);
    }
  });

  const json = JSON.stringify(enriched, null, 2);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.FRUS_RECORDS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recordsReviewed: records.length,
        recordsEnriched: enriched.filter((record) => record.pageCount).length,
        failures,
        pageCountTotal: enriched.reduce((sum, record) => sum + (record.pageCount || 0), 0),
        extractionCoverage: {
          subject: enriched.filter((record) => record.pdfExtract?.subject).length,
          participants: enriched.filter((record) => record.pdfExtract?.participants).length,
          dateTimePlace: enriched.filter((record) => record.pdfExtract?.dateTimePlace).length,
          classificationMarking: enriched.filter((record) => record.pdfExtract?.classificationMarking).length
        }
      },
      null,
      2
    )}\n`
  );
}

main();
