const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const paths = {
  records: path.join(repoRoot, "data", "records.json"),
  compilerGaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  persons: path.join(repoRoot, "data", "persons.json"),
  personsScript: path.join(repoRoot, "data", "persons.js"),
  report: path.join(repoRoot, "reports", "persons-list-build.json"),
  masterSource: path.join(repoRoot, "reports", "persons-source-master.json")
};

const ROLE_STARTERS = /^(Acting|Administrative|Administrator|Admiral|Advisor|Adviser|Aide|Ambassador|Amir|Assistant|Associate|Attorney|Branch|Brig\.|Bureau|CA\/|Chair|Chairman|Charge|Charg[eé]|Chief|Colonel|Commandant|Commander|Commercial|Congressman|Consul|Coordinator|Counsel|Counselor|Country|Crown|Cultural|Deputy|Director|Economic|Emir|Executive|First|Foreign|General|Governor|Head|Human|International|King|Labor|Lawyer|Legal|Lt\.|Management|Member|Minister|National|Office|Personal|Political|Premier|President|Prime|Principal|Public|Queen|Regional|Representative|Secretary|Senior|Senator|Sheikh|Special|Staff|Sultan|The|Under|United|U\.S\.|Vice|White|PLO|PM\b|Italian|Soviet|Mexican|French|Spanish|West German|German|Nicaraguan|Ecuadorian|Netherlands|Israeli|Colombian|Jamaican|Jordanian|Saudi|Syrian|Egyptian|Lebanese|Kuwaiti|Bahraini|Moroccan|Algerian|Omani|Canadian|British|Japanese|Korean|Peruvian|Costa Rican|Honduran|Guatemalan|Panamanian|Venezuelan|Argentine|Chilean|Bolivian|Brazilian|Pakistani|Nigerian|Chinese|Malaysian|Thai|Tunisian|Togolese|Irish)/i;
const SUFFIX = /^(Jr\.|Sr\.|II|III|IV|V|Ph\.D\.|M\.D\.)$/i;
const TITLE_ROLES = [
  "foreign minister",
  "prime minister",
  "president",
  "secretary",
  "ambassador",
  "general",
  "sultan",
  "amir",
  "sheikh",
  "minister",
  "chancellor",
  "pope",
  "king"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clean(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[()[\].,;:'"`\u2018\u2019\u201c\u201d]/g, " ")
    .replace(/[-\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function extractLinesFromDocx(docxPath) {
  const text = execFileSync("textutil", ["-convert", "txt", "-stdout", docxPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  return text
    .split(/\n/)
    .map((line) => line.replace(/\f/g, "").trim())
    .filter(Boolean);
}

function datePhrase(raw) {
  const years = raw.match(/\d{4}/g) || [];
  if (years.length === 1) return `in ${years[0]}`;
  if (years.length > 1) return `from ${years[0]} until ${years[years.length - 1]}`;
  return raw;
}

function normalizeEntryText(line) {
  return clean(line)
    .replace(/\[(\d{4}(?:\s*[-,]\s*\d{4})*)\]/g, (_, years) => datePhrase(years))
    .replace(/\((\d{4}(?:\s*[-,]\s*\d{4})*)\)/g, (_, years) => datePhrase(years))
    .replace(/\s+;/g, ";")
    .replace(/\s+,/g, ",");
}

function parseEntry(line, index) {
  const parts = clean(line).split(/,\s+/);
  const surname = parts[0] || "";
  const nameSegments = [];
  let descriptionStart = 1;

  for (let indexPart = 1; indexPart < parts.length; indexPart += 1) {
    const segment = parts[indexPart];
    const looksLikeNonInvertedName = !nameSegments.length && tokenize(surname).length > 1;
    if ((nameSegments.length || looksLikeNonInvertedName) && ROLE_STARTERS.test(segment) && !SUFFIX.test(segment)) {
      descriptionStart = indexPart;
      break;
    }
    nameSegments.push(segment);
    descriptionStart = indexPart + 1;
    if (nameSegments.length >= 4) break;
  }

  const displayName = [surname, ...nameSegments].filter(Boolean).join(", ");
  return {
    index,
    sourceLine: line,
    entry: normalizeEntryText(line),
    displayName,
    sortName: surname,
    surname,
    nameSegments,
    description: parts.slice(descriptionStart).join(", ")
  };
}

function aliasesFor(entry) {
  const nameTokens = tokenize(entry.nameSegments.join(" ")).filter((token) => !/^(jr|sr|ii|iii|iv|v|lt|gen|adm|dr|col)$/.test(token));
  const significantNameTokens = nameTokens.filter((token) => token.length > 1);
  const surnameTokens = tokenize(entry.surname);
  const aliases = [];

  if (nameTokens.length && surnameTokens.length) {
    aliases.push([...nameTokens, ...surnameTokens].join(" "));
    if (significantNameTokens.length || surnameTokens.length > 1) aliases.push([significantNameTokens[0] || nameTokens[0], ...surnameTokens].join(" "));
    if ((significantNameTokens[0] || nameTokens[0]).length > 1) aliases.push([significantNameTokens[0] || nameTokens[0], surnameTokens[0]].join(" "));
  }

  if (/al-$/.test(entry.surname) && nameTokens.length) {
    aliases.push([...nameTokens, "al", entry.surname.replace(/\s*al-$/, "")].join(" "));
  }

  if (!nameTokens.length && surnameTokens.length > 1) {
    aliases.push(surnameTokens.join(" "));
  }

  return [...new Set(aliases.map((alias) => normalizeText(alias)))].filter((alias) => alias.length > 5);
}

function roleMatches(entry, role) {
  const text = normalizeText(entry.sourceLine);
  const patterns = {
    president: /\bpresident\b/,
    "prime minister": /prime minister/,
    king: /\bking\b/,
    secretary: /secretary/,
    "foreign minister": /foreign minister|minister of foreign affairs|foreign secretary/,
    ambassador: /ambassador/,
    general: /\bgen\b|general/,
    sultan: /sultan/,
    amir: /amir/,
    sheikh: /sheikh/,
    minister: /minister/,
    chancellor: /chancellor/,
    pope: /pope|john paul/
  };
  return (patterns[role] || new RegExp(role)).test(text);
}

function chapterName(item) {
  return item.chapter?.name || "Unassigned";
}

function chapterNumber(item) {
  return item.chapter?.number || (chapterName(item) === "Counterterrorism" ? 2 : 1);
}

function buildCorpus(records, compilerGaps) {
  return [
    ...records.map((record) => ({
      kind: "conversation",
      id: record.id,
      title: record.documentTitle || record.title,
      date: record.date,
      chapter: record.chapter,
      text: normalizeText([
        record.title,
        record.documentTitle,
        record.subjectLine,
        record.pdfExtract?.subject,
        record.pdfExtract?.participants,
        record.pdfExtract?.dateTimePlace
      ].filter(Boolean).join(" "))
    })),
    ...compilerGaps.map((record) => ({
      kind: "compiler gap",
      id: record.id,
      title: record.title,
      date: record.date,
      chapter: record.chapter,
      text: normalizeText(record.title)
    }))
  ];
}

function titleTokensFor(entry) {
  const surnameTokens = tokenize(entry.surname).filter((token) => token.length > 3);
  if (entry.nameSegments.length) return surnameTokens.slice(0, 1);
  return surnameTokens;
}

function buildRoleCandidateCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    for (const role of TITLE_ROLES) {
      if (!roleMatches(entry, role)) continue;
      for (const token of titleTokensFor(entry)) {
        counts[`${role}:${token}`] = (counts[`${role}:${token}`] || 0) + 1;
      }
    }
  }
  return counts;
}

function matchEntry(entry, corpus, roleCandidateCounts) {
  const surnameTokens = tokenize(entry.surname);
  const surnameFirst = surnameTokens[0] || "";
  const surnameFull = surnameTokens.join(" ");
  const references = [];

  for (const item of corpus) {
    let matched = entry.aliases.some((alias) => item.text.includes(alias));

    if (!matched && surnameFirst.length > 3) {
      for (const role of TITLE_ROLES) {
        const shortPhrase = `${role} ${surnameFirst}`;
        const fullPhrase = `${role} ${surnameFull}`;
        if (
          (item.text.includes(shortPhrase) || (surnameFull !== surnameFirst && item.text.includes(fullPhrase)))
          && roleMatches(entry, role)
          && roleCandidateCounts[`${role}:${surnameFirst}`] === 1
        ) {
          matched = true;
          break;
        }
      }
    }

    if (!matched && !entry.nameSegments.length) {
      for (const role of TITLE_ROLES) {
        if (!roleMatches(entry, role)) continue;
        for (const token of titleTokensFor(entry)) {
          if (roleCandidateCounts[`${role}:${token}`] === 1 && item.text.includes(`${role} ${token}`)) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }

    if (matched) {
      references.push({
        kind: item.kind,
        id: item.id,
        title: item.title,
        date: item.date,
        chapter: item.chapter
      });
    }
  }

  return references;
}

function sourceLabel(kind) {
  if (kind === "conversation") return "Declassified memcon/telcon";
  if (kind === "compiler gap") return "Compiler gap";
  return kind;
}

function buildPersons(masterEntries, records, compilerGaps) {
  const corpus = buildCorpus(records, compilerGaps);
  const roleCandidateCounts = buildRoleCandidateCounts(masterEntries);
  return masterEntries
    .map((entry) => {
      const references = matchEntry(entry, corpus, roleCandidateCounts);
      const chapters = [...new Map(references.map((ref) => [chapterName(ref), { number: chapterNumber(ref), name: chapterName(ref) }])).values()]
        .sort((a, b) => a.number - b.number);
      const sourceTypes = [...new Set(references.map((ref) => sourceLabel(ref.kind)))].sort();

      return {
        id: `person-${slug(entry.displayName || entry.sortName)}`,
        sortName: entry.sortName,
        displayName: entry.displayName,
        entry: entry.entry,
        sourceLine: entry.sourceLine,
        aliases: entry.aliases,
        chapters,
        sourceTypes,
        referenceCount: references.length,
        references
      };
    })
    .filter((entry) => entry.referenceCount)
    .sort((a, b) => a.sortName.localeCompare(b.sortName) || a.displayName.localeCompare(b.displayName));
}

function loadMasterEntries(docxPath) {
  let lines;
  let source;

  if (docxPath) {
    lines = extractLinesFromDocx(docxPath);
    source = docxPath;
  } else if (fs.existsSync(paths.masterSource)) {
    const master = readJson(paths.masterSource);
    lines = master.entries.map((entry) => entry.sourceLine);
    source = paths.masterSource;
  } else {
    throw new Error("Provide the Bush comprehensive names DOCX path as an argument or BUSH_NAMES_DOCX, or keep reports/persons-source-master.json in the repo.");
  }

  const entries = lines.map(parseEntry).map((entry) => ({ ...entry, aliases: aliasesFor(entry) }));
  return { source, lines, entries };
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = selector(value) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function main() {
  const docxPath = process.argv[2] || process.env.BUSH_NAMES_DOCX || "";
  const records = readJson(paths.records);
  const compilerGaps = readJson(paths.compilerGaps);
  const master = loadMasterEntries(docxPath);
  const persons = buildPersons(master.entries, records, compilerGaps);

  const json = JSON.stringify(persons, null, 2);
  fs.writeFileSync(paths.persons, `${json}\n`);
  fs.writeFileSync(paths.personsScript, `window.FRUS_PERSONS = ${json};\n`);

  const masterJson = {
    generatedAt: new Date().toISOString(),
    source: master.source,
    entries: master.entries.map((entry) => ({
      index: entry.index,
      displayName: entry.displayName,
      sortName: entry.sortName,
      sourceLine: entry.sourceLine,
      normalizedEntry: entry.entry,
      aliases: entry.aliases
    }))
  };
  fs.writeFileSync(paths.masterSource, `${JSON.stringify(masterJson, null, 2)}\n`);

  fs.writeFileSync(
    paths.report,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: master.source,
        masterEntries: master.entries.length,
        matchedPersons: persons.length,
        corpusRecords: records.length,
        corpusCompilerGaps: compilerGaps.length,
        personsByChapter: countBy(persons.flatMap((person) => person.chapters), (chapter) => chapter.name),
        personsBySourceType: countBy(persons.flatMap((person) => person.sourceTypes), (sourceType) => sourceType),
        highReferencePersons: persons
          .filter((person) => person.referenceCount >= 8)
          .map((person) => ({ displayName: person.displayName, referenceCount: person.referenceCount }))
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${persons.length} persons from ${master.entries.length} master entries`);
}

main();
