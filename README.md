# FRUS 1989-1992 Volume XXVIII Source Files

A GitHub Pages working archive for source records relevant to
*Foreign Relations of the United States, 1989-1992, Volume XXVIII,
Counternarcotics and Counterterrorism*.

The site follows the same basic static pattern as the Bush 41 Western Europe,
South Asia, and South America companion sites. Records live in `data/records.json`,
with `data/records.js` as a browser-friendly mirror. The site presents two
separate chronological chapters:

1. Counternarcotics
2. Counterterrorism

## Source Collections

The first harvester searches the National Archives Catalog for file-unit records
inside these source NAIDs:

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

## NARA Scout Review

The first review pass examined this NARA Scout search in Chrome:

<https://therealjameswilson.github.io/nara-scout/#q=terrorism+OR+narcotics&sort=relevance&perColl=25&perPage=50&scope=bush41>

NARA Scout reported 3,925 total matching records across the 70 Bush 41
collections, merged to 222 visible results after its per-collection cap and
FRUS-workflow filters. The local harvester reproduces that exact fan-out and
then applies a compiler-focused review list to keep high-value records for the
site while preserving excluded topic hits in the audit.

The primary chronology emphasizes FRUS-likely document forms: memcons, telcons,
meeting minutes, follow-up meeting files, directives/reviews, substantive
memoranda or reports, and anchoring event files such as the San Antonio
Narcotics Summit. Broader topical folders remain in the audit reports rather
than the main chronology.

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

## Local Preview

Run a static server from the repository root:

```bash
python3 -m http.server 4182 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4182/>.

## Source Anchors

- FRUS 1989-1992, Volume XXVIII: <https://history.state.gov/historicaldocuments/frus1989-92v28>
- National Archives Catalog: <https://catalog.archives.gov/>
