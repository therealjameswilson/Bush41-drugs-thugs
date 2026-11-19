const a=require("node:assert/strict"), p=require("../source-note-provenance"), rows=require("../data/records.json");
const reviewed=[["428080173","CF01731-008","Confidential"],["428080241","CF01729-009","Secret"],["428080243","CF01729-010","Secret"],["428080487","CF01729-014","Confidential"],["428080509","CF01731-013","Secret"]];
for(const [id,f,m] of reviewed) {
  const r=rows.find(x=>String(x.naid)===id), check=p.audit(r);
  a.ok(check.note.includes(f)); a.ok(check.note.endsWith(m+"."));
  a.equal(check.hasControl,false); a.equal(check.state,"control-pending");
  a.equal(p.reviewedRecord(r).pdfExtract.classificationMarking,m);
}
const base=rows.find(x=>!p.scanReview(x));
a.equal(p.reviewedRecord(base),base);
a.equal(p.audit({...base,frusSourceNote:base.frusSourceNote+" OA/ID CF01729, folder CF01729-014."}).hasControl,false);
a.equal(p.summarize(rows).invalid,0);
