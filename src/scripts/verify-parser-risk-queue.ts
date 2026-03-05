import fs from 'fs/promises';
import path from 'path';
import { MarvelCrawlerService } from '../services/MarvelCrawlerService';

type ParserRiskIssue = {
  label: string;
  variantCount: number;
  storyCountMismatch: boolean;
  storyPresenceMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
  reprintFlagMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
};

type ClassificationReport = {
  remainingParserRisk?: {
    issues?: ParserRiskIssue[];
  };
};

type VerifyResult =
  | {
      label: string;
      outcome: 'manual-not-found';
      error: string;
    }
  | {
      label: string;
      outcome: 'still-open';
      storyCount: number;
      reprintStoryCount: number;
    };

type Args = {
  report: string;
  out: string;
  concurrency: number;
  checkpointEvery: number;
};

const DEFAULT_REPORT = path.resolve(process.cwd(), 'reports/us-issue-crawl-reimport-classification.json');
const DEFAULT_OUT = path.resolve(process.cwd(), 'reports/us-issue-crawl-parser-risk-verification.json');

function parseArgs(argv: string[]): Args {
  const args: Args = {
    report: DEFAULT_REPORT,
    out: DEFAULT_OUT,
    concurrency: 4,
    checkpointEvery: 25,
  };

  for (const raw of argv) {
    if (raw.startsWith('--report=')) {
      args.report = path.resolve(process.cwd(), raw.slice('--report='.length));
      continue;
    }
    if (raw.startsWith('--out=')) {
      args.out = path.resolve(process.cwd(), raw.slice('--out='.length));
      continue;
    }
    if (raw.startsWith('--concurrency=')) {
      const value = Number(raw.slice('--concurrency='.length));
      if (Number.isFinite(value) && value > 0) args.concurrency = Math.max(1, Math.floor(value));
      continue;
    }
    if (raw.startsWith('--checkpoint-every=')) {
      const value = Number(raw.slice('--checkpoint-every='.length));
      if (Number.isFinite(value) && value > 0) args.checkpointEvery = Math.max(1, Math.floor(value));
    }
  }

  return args;
}

function parseLabel(label: string) {
  const match = label.match(/^(.*) \(Vol\. (\d+)\) #(.+)$/);
  if (!match) throw new Error(`Unparseable label: ${label}`);
  return {
    seriesTitle: match[1],
    volume: Number(match[2]),
    number: match[3],
  };
}

function seriesLabel(label: string): string {
  const match = label.match(/^(.*) \(Vol\. \d+\) #.+$/);
  return match ? match[1] : label;
}

function sortByCount(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await fs.readFile(args.report, 'utf8')) as ClassificationReport;
  const issues = source.remainingParserRisk?.issues || [];
  if (issues.length === 0) throw new Error(`No remaining parser-risk issues found in ${args.report}`);

  await fs.mkdir(path.dirname(args.out), { recursive: true });

  const crawler = new MarvelCrawlerService();
  const results: VerifyResult[] = [];

  const writeCheckpoint = async () => {
    const manualNotFound = results.filter((result) => result.outcome === 'manual-not-found');
    const stillOpen = results.filter((result) => result.outcome === 'still-open');

    const manualBySeries = new Map<string, number>();
    for (const result of manualNotFound) {
      const series = seriesLabel(result.label);
      manualBySeries.set(series, (manualBySeries.get(series) || 0) + 1);
    }

    const openBySeries = new Map<string, number>();
    for (const result of stillOpen) {
      const series = seriesLabel(result.label);
      openBySeries.set(series, (openBySeries.get(series) || 0) + 1);
    }

    const output = {
      generatedAt: new Date().toISOString(),
      sourceReport: args.report,
      totals: {
        queued: issues.length,
        verified: results.length,
        manualNotFound: manualNotFound.length,
        stillOpen: stillOpen.length,
      },
      manualNotFound: {
        bySeriesTop: sortByCount(manualBySeries).slice(0, 50),
        issues: manualNotFound,
      },
      stillOpen: {
        bySeriesTop: sortByCount(openBySeries).slice(0, 50),
        issues: stillOpen,
      },
    };

    await fs.writeFile(args.out, JSON.stringify(output, null, 2));
  };

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= issues.length) return;

      const issue = issues[index];
      const parsed = parseLabel(issue.label);

      try {
        const crawled = (await crawler.crawlIssue(parsed.seriesTitle, parsed.volume, parsed.number)) as {
          stories?: Array<{ reprintOf?: unknown }>;
        };
        const stories = Array.isArray(crawled.stories) ? crawled.stories : [];
        const reprintStoryCount = stories.filter((story) => Boolean(story.reprintOf)).length;
        results[index] = {
          label: issue.label,
          outcome: 'still-open',
          storyCount: stories.length,
          reprintStoryCount,
        };
      } catch (error) {
        results[index] = {
          label: issue.label,
          outcome: 'manual-not-found',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const completed = results.filter(Boolean).length;
      if (completed % args.checkpointEvery === 0 || completed === issues.length) {
        await writeCheckpoint();
        console.log(
          `[verify-parser-risk] ${completed}/${issues.length} verified manual-not-found=${
            results.filter((result) => result?.outcome === 'manual-not-found').length
          } still-open=${results.filter((result) => result?.outcome === 'still-open').length}`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(args.concurrency, issues.length) }, () => worker()));
  await writeCheckpoint();

  const manualCount = results.filter((result) => result.outcome === 'manual-not-found').length;
  const openCount = results.filter((result) => result.outcome === 'still-open').length;
  console.log(
    `[verify-parser-risk] wrote ${args.out}\n` +
      `[verify-parser-risk] queued=${issues.length} verified=${results.length} manual-not-found=${manualCount} still-open=${openCount}`,
  );
}

main().catch((error) => {
  console.error('[verify-parser-risk] failed', error);
  process.exit(1);
});
