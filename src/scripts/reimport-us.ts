import fs from 'fs/promises';
import path from 'path';
import { runReimport } from '../core/reimport';
import { closeDbModels, createDbModels } from '../core/db-model-factory';

type Args = {
  out: string;
  dryRun: boolean;
  enableTargetDeFastPath: boolean;
  targetDb: string;
};

const DEFAULT_DRY_OUT = path.resolve(process.cwd(), 'reports/reimport-us-dry-run.json');
const DEFAULT_PROD_OUT = path.resolve(process.cwd(), 'reports/reimport-us-prod.json');

const parseBooleanArg = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const parseArgs = (argv: string[]): Args => {
  let dryRun = true;
  let enableTargetDeFastPath = false;
  let out: string | null = null;
  let targetDb = 'shortbox_migration';

  for (const raw of argv) {
    if (raw.startsWith('--dry-run=')) {
      dryRun = parseBooleanArg(raw.slice('--dry-run='.length), true);
      continue;
    }
    if (raw === '--prod') {
      dryRun = false;
      continue;
    }
    if (raw === '--resume' || raw === '--incremental') {
      enableTargetDeFastPath = true;
      continue;
    }
    if (raw.startsWith('--enable-target-de-fast-path=')) {
      enableTargetDeFastPath = parseBooleanArg(
        raw.slice('--enable-target-de-fast-path='.length),
        false,
      );
      continue;
    }
    if (raw.startsWith('--out=')) {
      out = path.resolve(process.cwd(), raw.slice('--out='.length));
      continue;
    }
    if (raw.startsWith('--target-db=')) {
      targetDb = raw.slice('--target-db='.length).trim() || targetDb;
    }
  }

  return {
    dryRun,
    enableTargetDeFastPath,
    targetDb,
    out: out || (dryRun ? DEFAULT_DRY_OUT : DEFAULT_PROD_OUT),
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetModels = args.dryRun ? null : createDbModels(args.targetDb);

  try {
    const report = await runReimport({
      dryRun: args.dryRun,
      enableTargetDeFastPath: args.enableTargetDeFastPath,
      collectDetails: args.dryRun,
      scope: { kind: 'all-us' },
      targetModels: targetModels || undefined,
    });

    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, JSON.stringify(report, null, 2));

    const prefix = args.dryRun ? '[reimport-dry-run]' : '[reimport-prod]';
    console.log(
      `${prefix} wrote ${args.out}\n` +
        `${prefix} deSeries=${report.summary.totalDeSeries} ` +
        `deIssues=${report.summary.totalDeIssues} ` +
        `usIssues=${report.summary.totalMappedUsIssues} ` +
        `shortbox=${report.summary.results.shortbox} ` +
        `crawler=${report.summary.results.crawler} ` +
        `moved=${report.summary.results.moved} ` +
        `manual=${report.summary.results.manual}`,
    );
  } finally {
    await closeDbModels(targetModels || undefined);
  }
}

main().catch((error) => {
  console.error('[reimport] failed', error);
  process.exit(1);
});
