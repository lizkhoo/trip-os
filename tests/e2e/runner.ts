/**
 * Minimal e2e assertion + test contract. Dependency-free (no vitest/jest) so the
 * runner stays a plain tsx entrypoint that mirrors smoke.ts's console style.
 */
import { createHarness, type Harness } from './harness';

export interface TestContext {
  harness: Harness;
  /** Assert truthy; logs ✓/✗ and records a failure (does not throw). */
  assert: (condition: boolean, message: string) => void;
  assertEqual: (actual: unknown, expected: unknown, message: string) => void;
}

export type E2eTest = (ctx: TestContext) => Promise<void>;

export interface TestResult {
  passed: number;
  failed: number;
}

/**
 * Run one exported e2e test inside its own fresh harness, with automatic
 * teardown. Returns the assertion tally; a thrown error counts as a failure.
 */
export async function runTest(name: string, test: E2eTest): Promise<TestResult> {
  console.log(`\n▶ ${name}`);
  const harness = createHarness();
  const result: TestResult = { passed: 0, failed: 0 };
  const ctx: TestContext = {
    harness,
    assert: (condition, message) => {
      if (condition) {
        console.log(`  ✓ ${message}`);
        result.passed += 1;
      } else {
        console.error(`  ✗ ${message}`);
        result.failed += 1;
      }
    },
    assertEqual: (actual, expected, message) => {
      const ok = Object.is(actual, expected);
      if (ok) {
        console.log(`  ✓ ${message}`);
        result.passed += 1;
      } else {
        console.error(`  ✗ ${message} (expected ${String(expected)}, got ${String(actual)})`);
        result.failed += 1;
      }
    },
  };
  try {
    await test(ctx);
  } catch (err) {
    console.error(`  ✗ threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    result.failed += 1;
  } finally {
    harness.teardown();
  }
  return result;
}
