import { migrator } from '../core/migrations';

migrator.runAsCLI().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration command failed: ${message}`);
  process.exitCode = 1;
});
