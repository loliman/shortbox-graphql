import { runReimport } from '../core/reimport';

const isDryRunRequested = (): boolean => {
  const hasFlag = process.argv.includes('--dry-run');
  if (hasFlag) return true;
  return String(process.env.REIMPORT_DRY_RUN || 'false').toLowerCase() === 'true';
};

async function main() {
  const report = await runReimport({
    dryRun: isDryRunRequested(),
    scope: { kind: 'all-us' },
  });

  if (!report) {
    process.exitCode = 1;
    return;
  }
}

main().catch(() => {
  process.exitCode = 1;
});
