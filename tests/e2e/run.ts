/**
 * e2e test runner. Discovers every *.e2e.ts file in this directory, runs its
 * exported `test` fn inside a fresh harness, prints ✓/✗ per assertion, and exits
 * non-zero on any failure. Same console style as scripts/smoke.ts; no test framework.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runTest, type E2eTest } from './runner';

interface E2eModule {
  name: string;
  test: E2eTest;
}

async function main(): Promise<void> {
  const dir = __dirname;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.e2e.ts'))
    .sort();

  if (files.length === 0) {
    console.error('✗ no *.e2e.ts files found');
    process.exit(1);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    const mod = (await import(path.join(dir, file))) as Partial<E2eModule>;
    if (typeof mod.test !== 'function' || typeof mod.name !== 'string') {
      console.error(`✗ ${file} must export { name: string, test: E2eTest }`);
      totalFailed += 1;
      continue;
    }
    const result = await runTest(mod.name, mod.test);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log(`\n${totalFailed === 0 ? '✓' : '✗'} e2e: ${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
