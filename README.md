# FRUS 1989-1992 Volume XXVIII Source Files

A GitHub Pages working archive for source records relevant to
*Foreign Relations of the United States, 1989-1992, Volume XXVIII,
Counternarcotics and Counterterrorism*.

The site follows the same basic static pattern as the Bush 41 Western Europe,
South Asia, and South America companion sites. Records live in `data/records.json`,
with `data/records.js` as a browser-friendly mirror. The public chronology is
narrowed to declassified memoranda of conversation and telephone conversations
with online PDFs. It presents two separate chronological chapters:

1. Counternarcotics
2. Counterterrorism

The site also includes a separate Public Papers reference section for Bush's
public statements on the same subjects. Those references are drawn from GovInfo,
kept separate from the archival chronology, and cited as compact Public Papers
source notes.

## Compiler Workbench

The public site is optimized for a FRUS compiler rather than general browsing.
The workbench supports:

- search across titles, NAIDs, source notes, source series, filenames, and
  matched topical evidence
- filters for chapter, document type, year, source series, match strength, and
  local review state
- chapter chronology, single chronology, match-strength, and document-type sorts
- local "reviewed" marking in browser storage
- local Include / Maybe / Exclude selection triage, with selection filters and
  export fields for compiler working decisions
- local per-record compiler notes, note filters, and portable triage JSON
  export/import for moving review state across browsers
- live selection-coverage dashboard with chapter balance, selected page totals,
  strong unassigned leads, and included records still missing compiler notes
- measured PDF page counts and first-page extraction checks for subject,
  participants, date/time/place, and classification markings
- copyable FRUS-style source-note drafts for PDF verification and editorial drafting
- same-day Presidential Daily Diary and Daily Backup control references for
  meetings and calls
- a separate Catalog trail for URLs, object IDs, NAIDs, access status, and digital-object evidence
- CSV export of the currently visible record set
- Markdown compiler-packet export for the currently visible chronology, with
  source-note drafts, PDF links, Catalog trails, Daily Diary controls, and
  verification reminders
- event dossiers for major chronology anchors such as Cartagena, San Antonio,
  Pan Am 103, hostages, and the National Drug Control Strategy
- a compiler-risk queue for NSC/DC, Chief of Staff, WHORM, and policy files
  that may need pulling, explaining, or excluding
- a FRUS-style Persons list generated from the Bush comprehensive names list
  and matched against the Volume XXVIII conversation/gap corpus
- a separate GovInfo Public Papers reference layer with Public Papers citations,
  PDF page links, public-voice filters, passing-mention review, and CSV export

The workbench reflects FRUS production practice: it keeps chronological
arrangement central, treats source-note metadata as something to verify in the
PDF, and separates discovery evidence from final editorial selection. Source-note
drafts follow the compact pattern used in FRUS 1989-1992, Volume XXXI:
repository and collection path first, then classification when the PDF extraction
supports it. Catalog URLs, NAIDs, digital-object details, FOIA numbers, and
access flags are kept in the separate Catalog trail rather than the source-note
line.

## Source Collections

The public site is built from unrestricted, item-level presidential
conversation records with online PDFs inside these source series:

- Presidential Memcon Files, NAID 321498039: <https://catalog.archives.gov/id/321498039>
- Presidential Telcon Files, NAID 321498139: <https://catalog.archives.gov/id/321498139>
- Presidential Daily Diary and Presidential Daily Backup Materials, NAID 186322:
  <https://catalog.archives.gov/id/186322>

Refresh the public chronology with:

```bash
node scripts/harvest-presidential-conversations.js
node scripts/enrich-conversation-pdfs.js
node scripts/refresh-source-notes.js
node scripts/harvest-daily-diary-references.js
```

This writes:

- `data/records.json`
- `data/records.js`
- `reports/presidential-conversation-harvest.json`
- `reports/conversation-pdf-enrichment.json`
- `reports/source-notes-refresh.json`
- `data/schedule-references.json`
- `data/schedule-references.js`
- `reports/daily-diary-references-harvest.json`

The enrichment step downloads the online conversation PDFs into `.cache`,
measures page counts with `pdfinfo`, extracts first-page text with `pdftotext`,
and stores the resulting verification metadata in each record.

The Daily Diary step queries NAID 186322 by exact date and attaches same-day
schedule-control references to each declassified memcon/telcon. These references
are meant to corroborate appointment, call, time, and location context; they are
not treated as substitute conversation transcripts.

Refresh the public-statements reference layer with:

```bash
node scripts/harvest-public-statements.js
```

This downloads cached GovInfo Public Papers PDFs into `.cache/public-papers`,
extracts official PDF text, promotes entries with title or substantive body
signals, and writes:

- `data/public-statements.json`
- `data/public-statements.js`
- `reports/public-statements-harvest.json`

Public Papers source notes follow the compact form used in FRUS source notes,
for example: `Public Papers: Bush, 1992-93, vol. I, pp. 320-321.` The audit
report retains passing keyword mentions that were reviewed but not promoted to
the public reference list.

The broader discovery harvesters search the National Archives Catalog for
file-unit records inside these source NAIDs and preserve their results as audit
reports:

- Brent Scowcroft Papers, NAID 4522156: <https://catalog.archives.gov/id/4522156>
- H-Files - National Security Council (NSC) Meeting Files, NAID 312293887: <https://catalog.archives.gov/id/312293887>
- H-Files - NSC/Deputies Committee Meeting Files, NAID 312294079: <https://catalog.archives.gov/id/312294079>
- H-Files - NSC/Deputies Committee Meeting Follow-Up Files, NAID 312294094: <https://catalog.archives.gov/id/312294094>
- H-Files - National Security Review Files, NAID 313189297: <https://catalog.archives.gov/id/313189297>
- H-Files - National Security Directive Files, NAID 313189290: <https://catalog.archives.gov/id/313189290>
- Institutional Files - Transition Files, NAID 348937136: <https://catalog.archives.gov/id/348937136>
- White House Office of Records Management, NAID 564645: <https://catalog.archives.gov/id/564645>
- White House Office of the Chief of Staff, NAID 580456: <https://catalog.archives.gov/id/580456>
- Bush Library All Textual Collections index: <https://www.bush41library.gov/digital-research-room/about-textual-collections/all-textual-collections>

## Compiler Risk Layer

After running the broad harvesters, rebuild the site-level risk data with:

```bash
node scripts/build-compiler-risk-data.js
node scripts/refresh-source-notes.js
```

This writes:

- `data/compiler-gaps.json`
- `data/compiler-gaps.js`
- `data/event-dossiers.json`
- `data/event-dossiers.js`
- `data/public-statement-review.json`
- `data/public-statement-review.js`
- `reports/compiler-risk-data.json`

The gap builder deduplicates against the published memcon/telcon chronology and
keeps non-conversation candidates visible as explicit compiler risks. It
includes listed-but-offline files, measured online PDFs with restricted-possible
Catalog status, approximate page counts where only a folder listing exists,
event tags, source-confidence notes, and compact source-note drafts.

The event dossiers are not final editorial selections. They are working bundles
for chronology control: each dossier links declassified conversations, missing
or restricted policy files, promoted Public Papers references, and lower-priority
Public Papers passing mentions for the same anchoring event.

## Persons List

Build the front-matter Persons list from the Bush comprehensive names DOCX with:

```bash
node scripts/build-persons-list.js /path/to/Bush-Comprehensive-Names-List.docx
```

This writes:

- `data/persons.json`
- `data/persons.js`
- `reports/persons-list-build.json`
- `reports/persons-source-master.json` as a local ignored cache of the full DOCX extraction

The formatter follows the published FRUS persons-page pattern: an alphabetized
bullet list of `Surname, Given Names, office/title` entries, with date ranges
rendered as prose rather than bracketed year tags. The matching pass uses the
attached comprehensive names list as the authority for descriptions and matches
entries against declassified conversation titles, first-page participant fields,
and compiler-gap titles.

## NARA Scout Review

The first review pass examined this NARA Scout search in Chrome:

<https://therealjameswilson.github.io/nara-scout/#q=terrorism+OR+narcotics&sort=relevance&perColl=25&perPage=50&scope=bush41>

NARA Scout reported 3,925 total matching records across the 70 Bush 41
collections, merged to 222 visible results after its per-collection cap and
FRUS-workflow filters. The local harvester reproduces that exact fan-out and
then applies a compiler-focused review list to keep high-value records for the
site while preserving excluded topic hits in the audit.

The current public chronology emphasizes only declassified memcons and telcons.
Broader topical folders, meeting minutes, directive/review files, policy
folders, and anchoring event files remain in the audit reports rather than the
main chronology.

Refresh the reviewed NARA Scout index with:

```bash
node scripts/harvest-nara-scout-search.js
```

This writes:

- `data/records.json`
- `data/records.js`
- `reports/nara-scout-terrorism-narcotics-raw.json`
- `reports/nara-scout-volume28-candidates.json`

## Focused Catalog Harvest

The source-specific Catalog harvester can search the named Scowcroft, H-File,
NSR, NSD, and transition collections directly:

```bash
node scripts/harvest-topic-records.js
```

This writes:

- `data/records.json`
- `data/records.js`
- `reports/topic-records-harvest.json`

Use this as the deeper second pass after the Scout list, especially for NSC/DC
meeting and follow-up files that may fall below NARA Scout's per-collection cap.

## NSC/DC Listed Minutes

Listed NSC and Deputies Committee minutes may still carry a `Restricted -
Possibly` Catalog status even when a PDF is online, usually because processed
folders can include withdrawal sheets. Refresh the NSC/DC minute layer with:

```bash
node scripts/harvest-nsc-dc-minutes.js
```

This adds relevant NSC, NSC/DC, and NSC/DC follow-up files to the chronology.
Page counts are measured from online PDFs when possible; records with only a
Catalog listing receive an approximate count based on comparable files in the
same H-file series. The audit is written to
`reports/nsc-dc-minutes-harvest.json`.

## WHORM Source Files

The WHORM pass scours the broad White House Office of Records Management
collection, but it only integrates target series that look useful for a FRUS
compiler: Drug Summit in Colombia, Drug Summit in San Antonio, Office of
National Drug Control Policy, Narcotics, and Kidnapping and Hostages. Wider
keyword hits are preserved in the audit so generic Middle East Peace Process,
Persian Gulf, invitation, and correspondence hits do not drown the chronology.

Refresh the WHORM layer with:

```bash
node scripts/harvest-whorm.js
```

This writes `reports/whorm-harvest.json`. Online PDFs are measured when
available. Listed WHORM case files without online PDFs are carried as listed
but not online, with approximate page counts based on one legal file folder.

## Chief of Staff Files

The Chief of Staff pass searches the broad COS collection and promotes only
direct-title policy and anchor files: National Drug Control Strategy, Drugs
Issue - Drug Czar, Bennett and Martinez drug policy/control folders, Ed Rogers
Drug Information folders, and Pan Am 103 Commission folders. The wider
keyword set is retained in the audit because many COS hits are correspondence,
agenda, itinerary, or personnel files that are poor FRUS candidates.

Refresh the Chief of Staff layer with:

```bash
node scripts/harvest-chief-of-staff.js
```

This writes `reports/chief-of-staff-harvest.json` and measures online PDFs
before adding them to the chronology.

## All Textual Collections Sweep

The all-textual pass parses the Bush Library's complete textual-collections
index, searches every listed collection for counternarcotics and
counterterrorism terms, and keeps the broad hit set in
`reports/all-textual-collections-harvest.json`. The chronology promotion rule
is intentionally narrower than the audit: it keeps direct-title, FRUS-grade
policy files from NSC, DPC, Counsel, Cheney, VP national security, and adjacent
policy offices, while leaving press, speech, correspondence, personnel,
scheduling, Reagan-era, and campaign material in the audit.

Refresh the all-textual layer with:

```bash
node scripts/harvest-all-textual-collections.js
```

The report records all searched collections, reviewed hits, direct-title
matches, already-selected records, page-count basis, and files excluded after
PDF page review.

## Memcon/Telcon-Only Refinement

After running any broad harvest, narrow the public site back to declassified
memoranda of conversation and telephone conversations with online PDFs:

```bash
node scripts/refine-memcon-telcon-only.js
```

This rewrites `data/records.json` and `data/records.js` and writes
`reports/memcon-telcon-refinement.json`.

## Local Preview

Run a static server from the repository root:

```bash
python3 -m http.server 4182 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4182/>.

## Source Anchors

- FRUS 1989-1992, Volume XXVIII: <https://history.state.gov/historicaldocuments/frus1989-92v28>
- National Archives Catalog: <https://catalog.archives.gov/>
- GovInfo Public Papers, George H. W. Bush:
  <https://www.govinfo.gov/app/collection/ppp/president-41_Bush%2C%20George%20H.%20W.>
