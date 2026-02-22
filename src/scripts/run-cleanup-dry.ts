import { run } from '../core/cleanup';

const isDryRunRequested = (): boolean => {
  const hasFlag = process.argv.includes('--dry-run');
  if (hasFlag) return true;
  return String(process.env.CLEANUP_DRY_RUN || 'false').toLowerCase() === 'true';
};

async function main() {
  const report = await run({ dryRun: isDryRunRequested() });
  if (!report) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  process.exitCode = 1;
});
