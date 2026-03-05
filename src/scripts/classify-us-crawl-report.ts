import fs from 'fs/promises';
import path from 'path';

type StoryPresenceMismatch = {
  number: number;
  db: boolean;
  crawl: boolean;
};

type ReprintFlagMismatch = {
  number: number;
  db: boolean;
  crawl: boolean;
};

type HardConflictIssue = {
  label: string;
  variantCount: number;
  storyCountMismatch: boolean;
  storyPresenceMismatches: StoryPresenceMismatch[];
  reprintFlagMismatches: ReprintFlagMismatch[];
};

type CrawlFailure = {
  label: string;
  id: number;
  variantCount: number;
  crawlFailed: true;
  error: string;
};

type AnalysisReport = {
  generatedAt: string;
  totals: {
    total: number;
    crawlFailed: number;
    successful: number;
  };
  hardConflicts: {
    storyCountMismatchIssues: number;
    storyPresenceMismatchIssues: number;
    reprintFlagMismatchIssues: number;
    issues: HardConflictIssue[];
  };
  openCrawlFailures: CrawlFailure[];
};

type ParserRiskVerificationReport = {
  manualNotFound?: {
    issues?: Array<{ label: string; error?: string }>;
  };
  stillOpen?: {
    issues?: Array<{ label: string }>;
  };
};

type ReviewedFinding = {
  label: string;
  outcome: 'crawler-safe' | 'parser-fix' | 'manual-not-found';
  reason: string;
};

type ClassifiedIssue = {
  label: string;
  variantCount: number;
  storyCountMismatch: boolean;
  storyPresenceMismatches: StoryPresenceMismatch[];
  reprintFlagMismatches: ReprintFlagMismatch[];
};

const DEFAULT_REPORT = path.resolve(process.cwd(), 'reports/us-issue-crawl-analysis.json');
const DEFAULT_OUT = path.resolve(process.cwd(), 'reports/us-issue-crawl-reimport-classification.json');
const DEFAULT_VERIFICATION = path.resolve(process.cwd(), 'reports/us-issue-crawl-parser-risk-verification.json');

const REVIEWED_FINDINGS: ReviewedFinding[] = [
  {
    label: 'Journey into Mystery (Vol. 1) #102',
    outcome: 'crawler-safe',
    reason: 'Live-checked: four-story wiki structure with one clean reprint and one Tales of Asgard backup looked semantically correct.',
  },
  {
    label: 'Savage Sword of Conan (Vol. 1) #8',
    outcome: 'crawler-safe',
    reason: 'Live-checked: six-story magazine layout looked plausible and not parser-generated noise.',
  },
  {
    label: 'Captain America (Vol. 1) #600',
    outcome: 'crawler-safe',
    reason: 'Live-checked: four stories including one explicit reprint; wiki structure looked coherent.',
  },
  {
    label: 'Beware (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked: all four stories carried concrete reprintOf references to older issues.',
  },
  {
    label: 'Civil War II: Ulysses (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked: two stories with explicit reprintOf links into the Infinite Comic series.',
  },
  {
    label: 'Slapstick (Vol. 2) #3',
    outcome: 'crawler-safe',
    reason: 'Live-checked: single story with explicit reprintOf back to Slapstick Infinite Comic.',
  },
  {
    label: 'Captain Planet and the Planeteers (Vol. 1) #10',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes only one story section; extra local stories look like DB drift.',
  },
  {
    label: 'Captain America: First Vengeance (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes only chapter 1 as a story; extra local stories look like DB drift.',
  },
  {
    label: 'Amazing Spider-Man Annual (Vol. 2) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes a single story section.',
  },
  {
    label: 'Marvel Fanfare (Vol. 1) #34',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes a single story section.',
  },
  {
    label: 'Captain America (Vol. 2) #3',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section titled "Patriotism".',
  },
  {
    label: 'Captain America Annual (Vol. 1) #13',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections, not the larger local story count.',
  },
  {
    label: 'Captain America Collectors\' Preview (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes twelve distinct story sections and one explicit reprint.',
  },
  {
    label: 'Captain America: Red, White & Blue (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes fifteen distinct story sections; the crawler output matches that layout.',
  },
  {
    label: 'Marvel Fanfare (Vol. 1) #18',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections.',
  },
  {
    label: 'Avengers (Vol. 1) #10',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'Avengers (Vol. 1) #166',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes two story sections, including one explicit reprint.',
  },
  {
    label: 'Journey into Mystery (Vol. 1) #17',
    outcome: 'crawler-safe',
    reason: 'Live-checked issue output: six-story anthology layout with one explicit reprint looked semantically coherent.',
  },
  {
    label: 'Transformers (UK) (Vol. 1) #3',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes two story sections and both are parsed as reprints.',
  },
  {
    label: 'Hulk (Vol. 2) #16',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections.',
  },
  {
    label: 'Hulk (Vol. 2) #20',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly three story sections.',
  },
  {
    label: 'Tales to Astonish (Vol. 1) #20',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes three story sections including one explicit reprint.',
  },
  {
    label: 'New Avengers (Vol. 2) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections.',
  },
  {
    label: 'Daredevils (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes eight story sections with two explicit reprints.',
  },
  {
    label: 'Human Torch (Vol. 2) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections and both are parsed as reprints.',
  },
  {
    label: 'Transformers (UK) (Vol. 1) #133',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'Transformers (UK) (Vol. 1) #223',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes three story sections including two explicit reprints.',
  },
  {
    label: 'Savage Sword of Conan (Vol. 1) #11',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'Savage Sword of Conan (Vol. 1) #33',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly four story sections.',
  },
  {
    label: 'New Avengers (Vol. 1) #28',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'New Avengers (Vol. 4) #11',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly five story sections.',
  },
  {
    label: 'Marvel Universe: Ultimate Spider-Man (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly four story sections.',
  },
  {
    label: 'Marvel Universe: Ultimate Spider-Man (Vol. 1) #2',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly three story sections.',
  },
  {
    label: 'Strange Tales (Vol. 1) #110',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes four story sections including one explicit reprint.',
  },
  {
    label: 'Strange Tales (Vol. 1) #111',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes four story sections including one explicit reprint.',
  },
  {
    label: 'Miracleman (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes four story sections including two reprints.',
  },
  {
    label: 'Miracleman (Vol. 1) #2',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly three story sections.',
  },
  {
    label: 'Daredevils (Vol. 1) #2',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes eight story sections including two reprints.',
  },
  {
    label: 'Human Torch (Vol. 2) #2',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections and both are parsed as reprints.',
  },
  {
    label: 'Mystic (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly five story sections.',
  },
  {
    label: 'Mystic (Vol. 1) #2',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly five story sections including one explicit reprint.',
  },
  {
    label: 'Monsters Unleashed (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly nine story sections including multiple explicit reprints.',
  },
  {
    label: 'Spidey Super Stories (Vol. 1) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly seven story sections.',
  },
  {
    label: 'Tales of Suspense (Vol. 1) #40',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly three story sections.',
  },
  {
    label: 'Journey into Mystery (Vol. 1) #18',
    outcome: 'crawler-safe',
    reason: 'Live-checked issue output: six-story anthology layout with one explicit reprint looked semantically coherent.',
  },
  {
    label: 'Journey into Mystery (Vol. 1) #33',
    outcome: 'crawler-safe',
    reason: 'Live-checked issue output: seven-story anthology layout looked semantically coherent.',
  },
  {
    label: 'Journey into Mystery (Vol. 1) #102',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure and output: four-story anthology layout with one explicit reprint and one Tales of Asgard backup.',
  },
  {
    label: 'Avengers (Vol. 1) #116',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'Avengers (Vol. 1) #117',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly one story section.',
  },
  {
    label: 'Avengers (Vol. 4) #1',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections.',
  },
  {
    label: 'Hulk (Vol. 2) #17',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly two story sections.',
  },
  {
    label: 'Tales to Astonish (Vol. 1) #26',
    outcome: 'crawler-safe',
    reason: 'Live-checked page structure: wiki exposes exactly five story sections including one explicit reprint.',
  },
  {
    label: 'Beavis and Butthead (Vol. 1) #1',
    outcome: 'manual-not-found',
    reason: 'Re-checked with the strict exact-title resolver: page is not found.',
  },
  {
    label: 'Beavis and Butthead (Vol. 1) #10',
    outcome: 'manual-not-found',
    reason: 'Re-checked with the strict exact-title resolver: page is not found.',
  },
  {
    label: 'Beavis and Butthead (Vol. 1) #18',
    outcome: 'manual-not-found',
    reason: 'Re-checked with the strict exact-title resolver: page is not found.',
  },
  {
    label: 'Marvel Tales (Vol. 1) #1',
    outcome: 'manual-not-found',
    reason: 'Re-checked with the strict exact-title resolver: page is not found.',
  },
];

const FIXED_AFTER_REPORT_PREFIXES = [
  'Official Handbook of the Marvel Universe (Vol. 1) #',
  'Official Handbook of the Marvel Universe Master Edition (Vol. 1) #',
];

function parseArgs(argv: string[]) {
  const out = {
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    verification: DEFAULT_VERIFICATION,
  };

  for (const arg of argv) {
    if (arg.startsWith('--report=')) {
      out.report = path.resolve(process.cwd(), arg.slice('--report='.length));
      continue;
    }
    if (arg.startsWith('--out=')) {
      out.out = path.resolve(process.cwd(), arg.slice('--out='.length));
      continue;
    }
    if (arg.startsWith('--verification=')) {
      out.verification = path.resolve(process.cwd(), arg.slice('--verification='.length));
    }
  }

  return out;
}

function seriesLabel(label: string): string {
  const match = label.match(/^(.*) \(Vol\. \d+\) #.+$/);
  return match ? match[1] : label;
}

function sortByCount<T extends string>(counts: Map<T, number>) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count }));
}

function startsWithAny(label: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => label.startsWith(prefix));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await fs.readFile(args.report, 'utf8')) as AnalysisReport;
  let verification: ParserRiskVerificationReport | null = null;
  try {
    verification = JSON.parse(await fs.readFile(args.verification, 'utf8')) as ParserRiskVerificationReport;
  } catch {
    verification = null;
  }

  const reviewedSafeLabels = new Set(
    REVIEWED_FINDINGS.filter((finding) => finding.outcome === 'crawler-safe').map((finding) => finding.label),
  );
  const reviewedManualNotFound = REVIEWED_FINDINGS.filter((finding) => finding.outcome === 'manual-not-found');
  const reviewedManualNotFoundLabels = new Set(reviewedManualNotFound.map((finding) => finding.label));

  const fixedAfterReportLabels = report.hardConflicts.issues
    .filter((issue) => startsWithAny(issue.label, FIXED_AFTER_REPORT_PREFIXES))
    .map((issue) => issue.label);

  const parserFixLabels = new Set(fixedAfterReportLabels);
  const parserFixNotes = [
    ...REVIEWED_FINDINGS.filter((finding) => finding.outcome === 'parser-fix'),
    ...fixedAfterReportLabels.map((label) => ({
      label,
      outcome: 'parser-fix' as const,
      reason: 'Fixed after this full report: story headings like "1st profile" are now recognized.',
    })),
  ];

  const verifiedManualNotFoundLabels = new Set(
    ((verification?.manualNotFound?.issues || []) as Array<{ label: string }>).map((issue) => issue.label),
  );
  const verifiedStillOpenLabels = new Set(
    ((verification?.stillOpen?.issues || []) as Array<{ label: string }>).map((issue) => issue.label),
  );

  const baseRemainingParserRiskIssues: ClassifiedIssue[] = report.hardConflicts.issues
    .filter((issue) => !reviewedSafeLabels.has(issue.label))
    .filter((issue) => !reviewedManualNotFoundLabels.has(issue.label))
    .filter((issue) => !parserFixLabels.has(issue.label))
    .map((issue) => ({
      label: issue.label,
      variantCount: issue.variantCount,
      storyCountMismatch: issue.storyCountMismatch,
      storyPresenceMismatches: issue.storyPresenceMismatches,
      reprintFlagMismatches: issue.reprintFlagMismatches,
    }));

  const remainingParserRiskIssues: ClassifiedIssue[] =
    verification && verifiedStillOpenLabels.size + verifiedManualNotFoundLabels.size > 0
      ? baseRemainingParserRiskIssues.filter((issue) => verifiedStillOpenLabels.has(issue.label))
      : baseRemainingParserRiskIssues;

  const parserRiskBySeries = new Map<string, number>();
  const parserRiskByDirection = new Map<string, number>();
  for (const issue of remainingParserRiskIssues) {
    const series = seriesLabel(issue.label);
    parserRiskBySeries.set(series, (parserRiskBySeries.get(series) || 0) + 1);
    for (const mismatch of issue.storyPresenceMismatches) {
      const key = `db:${mismatch.db}->crawl:${mismatch.crawl}`;
      parserRiskByDirection.set(key, (parserRiskByDirection.get(key) || 0) + 1);
    }
  }

  const manualNotFoundBySeries = new Map<string, number>();
  for (const issue of report.openCrawlFailures) {
    const series = seriesLabel(issue.label);
    manualNotFoundBySeries.set(series, (manualNotFoundBySeries.get(series) || 0) + 1);
  }
  for (const label of reviewedManualNotFoundLabels) {
    const series = seriesLabel(label);
    manualNotFoundBySeries.set(series, (manualNotFoundBySeries.get(series) || 0) + 1);
  }
  for (const label of verifiedManualNotFoundLabels) {
    const series = seriesLabel(label);
    manualNotFoundBySeries.set(series, (manualNotFoundBySeries.get(series) || 0) + 1);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceReport: args.report,
    sourceGeneratedAt: report.generatedAt,
    totals: {
      total: report.totals.total,
      successful: report.totals.successful,
      manualNotFound:
        report.openCrawlFailures.length + reviewedManualNotFoundLabels.size + verifiedManualNotFoundLabels.size,
      hardConflictIssuesInSource: report.hardConflicts.issues.length,
      confirmedCrawlerSafeIssues: reviewedSafeLabels.size,
      reviewedManualNotFoundIssues: reviewedManualNotFoundLabels.size,
      verifiedFormerParserRiskManualNotFoundIssues: verifiedManualNotFoundLabels.size,
      confirmedParserFixIssues: parserFixLabels.size,
      remainingParserRiskIssues: remainingParserRiskIssues.length,
    },
    notes: [
      'manual-not-found is derived from exact-title crawl failures and is not treated as a crawler bug.',
      'confirmed-parser-fix issues are still present in the source full report if the fix landed afterwards.',
      'remaining-parser-risk is a review queue, not proof that the crawler is wrong.',
      'If a parser-risk verification report is present, former hard-conflict issues rechecked as exact-title not found are moved into manual-not-found.',
    ],
    confirmedCrawlerSafe: {
      reviewed: REVIEWED_FINDINGS.filter((finding) => finding.outcome === 'crawler-safe'),
    },
    confirmedParserFixes: {
      reviewed: parserFixNotes,
      prefixesAppliedAfterSourceReport: FIXED_AFTER_REPORT_PREFIXES,
    },
    manualNotFound: {
      total:
        report.openCrawlFailures.length + reviewedManualNotFoundLabels.size + verifiedManualNotFoundLabels.size,
      reviewedFromFormerHardConflicts: reviewedManualNotFound,
      verifiedFromFormerParserRisk:
        verification?.manualNotFound?.issues?.map((issue) => ({
          label: issue.label,
          error: issue.error || 'No parse.text for exact title',
        })) || [],
      bySeriesTop: sortByCount(manualNotFoundBySeries).slice(0, 50),
      issues: report.openCrawlFailures.map((issue) => ({
        label: issue.label,
        id: issue.id,
        variantCount: issue.variantCount,
        error: issue.error,
      })),
    },
    remainingParserRisk: {
      total: remainingParserRiskIssues.length,
      bySeriesTop: sortByCount(parserRiskBySeries).slice(0, 50),
      byPresenceDirection: sortByCount(parserRiskByDirection),
      issues: remainingParserRiskIssues,
      issuesSample: remainingParserRiskIssues.slice(0, 200),
    },
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(output, null, 2));

  console.log(
    `[crawl-classify] wrote ${args.out}\n` +
      `[crawl-classify] manual-not-found=${output.totals.manualNotFound} ` +
      `confirmed-safe=${output.totals.confirmedCrawlerSafeIssues} ` +
      `confirmed-parser-fix=${output.totals.confirmedParserFixIssues} ` +
      `remaining-parser-risk=${output.totals.remainingParserRiskIssues}`,
  );
}

main().catch((error) => {
  console.error('[crawl-classify] failed', error);
  process.exit(1);
});
