const fs = require("fs");
const path = require("path");
const provenance = require("../source-note-provenance");

const repoRoot = path.resolve(__dirname, "..");
const records = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "records.json"), "utf8"));
const summary = provenance.summarize(records);
const hardFailures = records
  .map((record) => ({ record, result: provenance.audit(record) }))
  .filter(({ result }) => result.hardIssues.length);

console.log(JSON.stringify({
  ...summary,
  publishedStandard: provenance.PUBLISHED_STANDARD_URL,
  hardFailures: hardFailures.map(({ record, result }) => ({
    naid: record.naid,
    title: record.documentTitle || record.title,
    issues: result.hardIssues
  }))
}, null, 2));

if (hardFailures.length) process.exitCode = 1;
