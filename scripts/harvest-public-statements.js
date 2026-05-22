const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, ".cache", "public-papers");
const dataPath = path.join(repoRoot, "data", "public-statements.json");
const dataScriptPath = path.join(repoRoot, "data", "public-statements.js");
const reportPath = path.join(repoRoot, "reports", "public-statements-harvest.json");

const PACKAGES = [
  {
    id: "PPP-1989-book1",
    citationYear: "1989",
    volumeLabel: "vol. I",
    dateSpan: "January 20-June 30, 1989"
  },
  {
    id: "PPP-1989-book2",
    citationYear: "1989",
    volumeLabel: "vol. II",
    dateSpan: "July 1-December 31, 1989"
  },
  {
    id: "PPP-1990-book1",
    citationYear: "1990",
    volumeLabel: "vol. I",
    dateSpan: "January 1-June 30, 1990"
  },
  {
    id: "PPP-1990-book2",
    citationYear: "1990",
    volumeLabel: "vol. II",
    dateSpan: "July 1-December 31, 1990"
  },
  {
    id: "PPP-1991-book1",
    citationYear: "1991",
    volumeLabel: "vol. I",
    dateSpan: "January 1-June 30, 1991"
  },
  {
    id: "PPP-1991-book2",
    citationYear: "1991",
    volumeLabel: "vol. II",
    dateSpan: "July 1-December 31, 1991"
  },
  {
    id: "PPP-1992-book1",
    citationYear: "1992-93",
    volumeLabel: "vol. I",
    dateSpan: "January 1-July 31, 1992"
  },
  {
    id: "PPP-1992-book2",
    citationYear: "1992-93",
    volumeLabel: "vol. II",
    dateSpan: "August 1, 1992-January 20, 1993"
  }
];

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12"
};

const DATE_RE = new RegExp(`^(${Object.keys(MONTHS).join("|")}) (\\d{1,2}), (\\d{4})$`);
const TITLE_PAGE_YEARS = new Set(["1989", "1990", "1991", "1992", "1993"]);

const CHAPTERS = {
  Counternarcotics: { number: 1, name: "Counternarcotics" },
  Counterterrorism: { number: 2, name: "Counterterrorism" }
};

const TERM_GROUPS = {
  Counternarcotics: [
    ["Drug summit", /\bdrug summit\b|\bCartagena\b|\bSan Antonio\b(?=[\s\S]{0,80}\bdrug)/gi],
    ["National Drug Control Strategy", /National Drug Control Strategy/gi],
    ["Office of National Drug Control Policy", /Office of National Drug Control Policy|Drug Control Policy/gi],
    ["Counternarcotics", /counter[-\s]?narcotics?/gi],
    ["Narcotics control", /narcotics? control|control of illegal narcotics|narcotics? certification/gi],
    ["Illicit drugs", /illicit (?:traffic in )?(?:narcotic )?drugs?|illegal (?:traffic in )?(?:narcotic )?drugs?/gi],
    ["Drug trafficking", /drug traffick(?:ing|ers?)|narcotics? traffick(?:ing|ers?)/gi],
    ["Drug abuse", /drug abuse|substance abuse|drug prevention|drug[-\s]?free|anti[-\s]?drug|war on drugs/gi],
    ["Cocaine/crack", /cocaine|crack houses?/gi],
    ["Cartels/Escobar", /cartels?|Medell[ií]n|Cali cartel|Pablo Escobar/gi],
    ["DEA", /\bDEA\b|Drug Enforcement Administration/gi],
    ["Shipboarding", /shipboarding/gi],
    ["Noriega drug prosecution", /Noriega(?=[\s\S]{0,300}(?:drug|narcotic|traffick|cocaine|cartel))/gi],
    ["Alvarez-Machain", /Alvarez[-\s]?Machain/gi],
    ["Weed and Seed", /Weed and Seed/gi]
  ],
  Counterterrorism: [
    ["Terrorism", /\bterrorism\b|\bterrorists?\b|counter[-\s]?terrorism/gi],
    [
      "Hostages",
      /hostage(?:s|-taking)?|Terry Anderson|Robert Polhill|Frank Reed|Joseph Cicippio|Alann Steen|Jesse Turner|Thomas Sutherland|William Higgins|Colonel Higgins/gi
    ],
    ["Pan Am 103 / Lockerbie", /Pan Am(?:erican)?\s*(?:Flight\s*)?103|Lockerbie/gi],
    ["Aviation security", /aviation security|airline bombing/gi],
    [
      "Libya/Pan Am sanctions",
      /(?:Libya|Libyan|Qadhafi|Gaddafi|Kaddafi)(?=[\s\S]{0,300}(?:terror|Pan Am|Lockerbie|sanction|air traffic|emergency))/gi
    ],
    ["Middle East terror groups", /\b(?:Abu Nidal|Hezbollah|Hizballah|Islamic Jihad|PFLP|Hamas)\b/gi],
    ["Hijacking", /hijack(?:ing|er|ers)?/gi]
  ]
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clean(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/^['"`´\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function dateToIso(dateText) {
  const match = dateText.match(DATE_RE);
  if (!match) return "";
  const [, month, day, year] = match;
  return `${year}-${MONTHS[month]}-${String(day).padStart(2, "0")}`;
}

function pageRange(start, end) {
  if (!start) return "";
  if (!end || start === end) return `p. ${start}`;
  return `pp. ${start}-${end}`;
}

function govinfoPdfUrl(packageId) {
  return `https://www.govinfo.gov/content/pkg/${packageId}/pdf/${packageId}.pdf`;
}

function govinfoDetailsUrl(packageId) {
  return `https://www.govinfo.gov/app/details/${packageId}`;
}

function downloadPackage(packageInfo) {
  const pdfPath = path.join(cacheDir, `${packageInfo.id}.pdf`);
  const textPath = path.join(cacheDir, `${packageInfo.id}.txt`);

  if (!fs.existsSync(pdfPath)) {
    execFileSync("curl", [
      "-L",
      "--fail",
      "--retry",
      "5",
      "--retry-all-errors",
      "--silent",
      "--show-error",
      "--output",
      pdfPath,
      govinfoPdfUrl(packageInfo.id)
    ]);
  }

  if (!fs.existsSync(textPath)) {
    execFileSync("pdftotext", ["-layout", pdfPath, textPath], { stdio: "inherit" });
  }

  return { pdfPath, textPath };
}

function printedPageNumber(pageText) {
  const lines = pageText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!/^\d+$/.test(line)) continue;
    const number = Number(line);
    if (number > 0 && number < 3000 && !TITLE_PAGE_YEARS.has(line)) return number;
  }

  return null;
}

function skipTitleLine(line) {
  const value = line.trim();
  return (
    !value ||
    /^VerDate /.test(value) ||
    /^Administration of George Bush/i.test(value) ||
    /^[A-Z][a-z]{2,3}\. \d{1,2} \/ Administration/.test(value) ||
    /^George Bush/.test(value) ||
    /^PUBLIC PAPERS/.test(value)
  );
}

function collectTitle(lines, dateLineIndex, startLine) {
  const title = [];
  let index = dateLineIndex - 1;

  while (index >= startLine) {
    const value = lines[index].text.trim();
    const previous = lines[index - 1]?.text?.trim() || "";
    const isWrappedTitleYear = /^\d{4}$/.test(value) && previous && !skipTitleLine(previous);

    if (!isWrappedTitleYear && (/^\d+$/.test(value) || skipTitleLine(value))) break;
    title.unshift(value);
    index -= 1;
  }

  return {
    start: index + 1,
    title: clean(title.join(" "))
  };
}

function findCandidates(lines, startLine = 0, endLine = lines.length) {
  const candidates = [];

  for (let index = startLine; index < endLine; index += 1) {
    const dateText = lines[index].text.trim();
    if (!DATE_RE.test(dateText)) continue;

    const titleInfo = collectTitle(lines, index, startLine);
    if (!titleInfo.title || !/[A-Za-z]/.test(titleInfo.title) || titleInfo.title.length > 260) continue;

    candidates.push({
      title: titleInfo.title,
      dateText,
      date: dateToIso(dateText),
      start: titleInfo.start,
      dateLine: index,
      printedPageStart: lines[titleInfo.start]?.printedPage || null,
      pdfPageStart: lines[titleInfo.start]?.pdfPage || null
    });
  }

  return candidates;
}

function parseEntries(packageInfo, textPath) {
  const pages = fs.readFileSync(textPath, "utf8").split("\f");
  const lines = [];

  pages.forEach((pageText, pageIndex) => {
    const printedPage = printedPageNumber(pageText);
    const pdfPage = pageIndex + 1;
    for (const text of pageText.split(/\n/)) {
      lines.push({ text, printedPage, pdfPage });
    }
  });

  const firstPass = findCandidates(lines);
  const startLine = firstPass[0]?.start || 0;
  const endMarkers = [
    /^Appendix A\b/i,
    /^Document Categories List\b/i,
    /^Subject Index\b/i,
    /^Name Index\b/i,
    /^Checklist of White House Press Releases\b/i
  ];
  let endLine = lines.length;

  for (let index = startLine + 1; index < lines.length; index += 1) {
    const value = lines[index].text.trim();
    if (endMarkers.some((marker) => marker.test(value))) {
      endLine = index;
      break;
    }
  }

  const candidates = findCandidates(lines, startLine, endLine);
  return candidates.map((candidate, index) => {
    const nextStart = candidates[index + 1]?.start || endLine;
    let printedPageEnd = candidate.printedPageStart;
    let pdfPageEnd = candidate.pdfPageStart;

    for (let lineIndex = nextStart - 1; lineIndex >= candidate.start; lineIndex -= 1) {
      if (lines[lineIndex].printedPage) {
        printedPageEnd = lines[lineIndex].printedPage;
        pdfPageEnd = lines[lineIndex].pdfPage;
        break;
      }
    }

    return {
      ...candidate,
      packageId: packageInfo.id,
      printedPageEnd,
      pdfPageEnd,
      text: lines
        .slice(candidate.start, nextStart)
        .map((line) => line.text)
        .join("\n")
    };
  });
}

function termMatches(text, chapterName) {
  return TERM_GROUPS[chapterName]
    .map(([label, pattern]) => {
      pattern.lastIndex = 0;
      const matches = text.match(pattern) || [];
      return { label, count: matches.length };
    })
    .filter((match) => match.count > 0);
}

function scoreTerms(matches) {
  return matches.reduce((sum, match) => sum + match.count, 0);
}

function isPharmaceuticalFalsePositive(text) {
  return (
    /\b(Food and Drug Administration|drug marketing|approval process|prescription drugs|pharmaceutical|medical drugs)\b/i.test(text) &&
    !/(illegal|illicit|narcotic|cocaine|anti[-\s]?drug|drug abuse|drug control|traffick|DEA|war on drugs)/i.test(text)
  );
}

function classifyEntry(entry) {
  const fullText = clean(`${entry.title} ${entry.text}`);
  if (isPharmaceuticalFalsePositive(fullText)) return null;

  const chapterMatches = {
    Counternarcotics: termMatches(fullText, "Counternarcotics"),
    Counterterrorism: termMatches(fullText, "Counterterrorism")
  };
  const titleMatches = {
    Counternarcotics: termMatches(entry.title, "Counternarcotics"),
    Counterterrorism: termMatches(entry.title, "Counterterrorism")
  };

  const scores = {
    Counternarcotics: scoreTerms(chapterMatches.Counternarcotics) + scoreTerms(titleMatches.Counternarcotics) * 5,
    Counterterrorism: scoreTerms(chapterMatches.Counterterrorism) + scoreTerms(titleMatches.Counterterrorism) * 5
  };

  if (!scores.Counternarcotics && !scores.Counterterrorism) return null;

  const chapterName = scores.Counternarcotics >= scores.Counterterrorism ? "Counternarcotics" : "Counterterrorism";
  const titleHitCount = titleMatches[chapterName].length;
  const bodyOccurrenceCount = scoreTerms(chapterMatches[chapterName]);
  const distinctBodyHits = chapterMatches[chapterName].length;
  const relevance =
    titleHitCount > 0
      ? "Title anchor"
      : bodyOccurrenceCount >= 4 || distinctBodyHits >= 3
        ? "Substantive body"
        : "Passing mention";

  return {
    chapterName,
    relevance,
    promoted: relevance !== "Passing mention",
    matchedTerms: chapterMatches,
    titleTerms: titleMatches,
    bodyOccurrenceCount,
    distinctBodyHits
  };
}

function documentType(title) {
  const checks = [
    ["News conference", /News Conference/i],
    ["Exchange with reporters", /Exchange With Reporters|Question-and-Answer/i],
    ["Remarks", /^Remarks|^Toasts|^Address|^Interview/i],
    ["Statement", /^Statement|^Declaration/i],
    ["Message/letter", /^Message|^Letter/i],
    ["Memorandum/determination", /^Presidential Determination|^Memorandum|^Notice/i],
    ["Fact sheet", /Fact Sheet/i],
    ["Nomination/appointment", /^Nomination|^Appointment|^Designation/i],
    ["Joint statement", /^Joint Statement|^Joint News Conference/i]
  ];

  return checks.find(([, pattern]) => pattern.test(title))?.[0] || "Public paper";
}

function publicVoice(title) {
  if (/Press Secretary|Deputy Press Secretary|White House Statement|White House Fact Sheet/i.test(title)) {
    return "White House statement";
  }
  if (/^Nomination|^Appointment|^Designation/i.test(title)) {
    return "Administrative notice";
  }
  return "Presidential statement";
}

function citation(packageInfo, start, end) {
  return `Public Papers: Bush, ${packageInfo.citationYear}, ${packageInfo.volumeLabel}, ${pageRange(start, end)}.`;
}

function sourceTitle(packageInfo) {
  return `Public Papers of the Presidents of the United States: George Bush, ${packageInfo.citationYear}, ${packageInfo.volumeLabel}`;
}

function toReference(entry, packageInfo, classification) {
  const chapter = CHAPTERS[classification.chapterName];
  const pageText = pageRange(entry.printedPageStart, entry.printedPageEnd);
  const cite = citation(packageInfo, entry.printedPageStart, entry.printedPageEnd);
  const pdfUrl = govinfoPdfUrl(packageInfo.id);
  const pdfPageUrl = entry.pdfPageStart ? `${pdfUrl}#page=${entry.pdfPageStart}` : pdfUrl;
  const allTerms = [
    ...new Set(classification.matchedTerms[classification.chapterName].map((term) => term.label))
  ];

  return {
    id: `public-paper-${packageInfo.id}-${String(entry.printedPageStart || entry.pdfPageStart || 0).padStart(4, "0")}-${slug(entry.title)}`,
    title: entry.title,
    date: entry.date,
    dateText: entry.dateText,
    year: entry.date.slice(0, 4),
    chapter,
    documentType: documentType(entry.title),
    publicVoice: publicVoice(entry.title),
    relevance: classification.relevance,
    matchedTerms: classification.matchedTerms,
    titleTerms: classification.titleTerms,
    compilerUse: `${classification.relevance}; ${allTerms.join(", ")}`,
    printedPageStart: entry.printedPageStart,
    printedPageEnd: entry.printedPageEnd,
    pageRange: pageText,
    pdfPageStart: entry.pdfPageStart,
    pdfPageEnd: entry.pdfPageEnd,
    citation: cite,
    sourceNote: cite,
    govinfoUrl: govinfoDetailsUrl(packageInfo.id),
    pdfUrl,
    pdfPageUrl,
    source: {
      packageId: packageInfo.id,
      title: sourceTitle(packageInfo),
      shortName: `Public Papers: Bush, ${packageInfo.citationYear}, ${packageInfo.volumeLabel}`,
      dateSpan: packageInfo.dateSpan,
      govinfoUrl: govinfoDetailsUrl(packageInfo.id),
      pdfUrl
    }
  };
}

function sortReferences(a, b) {
  return (
    a.chapter.number - b.chapter.number ||
    a.date.localeCompare(b.date) ||
    (a.printedPageStart || 0) - (b.printedPageStart || 0) ||
    a.title.localeCompare(b.title)
  );
}

function writeOutputs(references, report) {
  ensureDir(path.dirname(dataPath));
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(dataPath, `${JSON.stringify(references, null, 2)}\n`);
  fs.writeFileSync(dataScriptPath, `window.BUSH_PUBLIC_STATEMENTS = ${JSON.stringify(references, null, 2)};\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function main() {
  ensureDir(cacheDir);

  const references = [];
  const passingMentions = [];
  const packageReports = [];
  let totalEntries = 0;

  for (const packageInfo of PACKAGES) {
    const { textPath } = downloadPackage(packageInfo);
    const entries = parseEntries(packageInfo, textPath);
    let topicalHits = 0;
    let promotedHits = 0;
    totalEntries += entries.length;

    for (const entry of entries) {
      const classification = classifyEntry(entry);
      if (!classification) continue;
      topicalHits += 1;

      if (classification.promoted) {
        promotedHits += 1;
        references.push(toReference(entry, packageInfo, classification));
      } else {
        passingMentions.push({
          packageId: packageInfo.id,
          date: entry.date,
          title: entry.title,
          printedPageStart: entry.printedPageStart,
          printedPageEnd: entry.printedPageEnd,
          chapter: classification.chapterName,
          matchedTerms: classification.matchedTerms[classification.chapterName]
        });
      }
    }

    packageReports.push({
      packageId: packageInfo.id,
      citationYear: packageInfo.citationYear,
      volumeLabel: packageInfo.volumeLabel,
      dateSpan: packageInfo.dateSpan,
      entriesParsed: entries.length,
      topicalKeywordHits: topicalHits,
      promotedReferences: promotedHits
    });
  }

  references.sort(sortReferences);

  const report = {
    generatedAt: new Date().toISOString(),
    source: "GovInfo Public Papers of the Presidents collection for George H. W. Bush",
    packages: packageReports,
    totals: {
      entriesParsed: totalEntries,
      topicalKeywordHits: references.length + passingMentions.length,
      promotedReferences: references.length,
      passingMentionsExcluded: passingMentions.length
    },
    promotionRule:
      "Promoted entries have topical signals in the title, or at least four body occurrences, or at least three distinct body signals. Passing mentions are retained in this audit but excluded from the public reference list.",
    passingMentions
  };

  writeOutputs(references, report);
  console.log(`Wrote ${references.length} public-statement references to ${path.relative(repoRoot, dataPath)}.`);
}

main();
