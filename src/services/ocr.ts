/**
 * OCR boundary. Production `ocrImage` will call the native Apple Vision module
 * (VNRecognizeTextRequest) to pull text out of a screenshot/PDF page; that
 * native bridge isn't wired up yet, so the production path throws a clear error
 * if invoked unmocked. The e2e harness injects deterministic OCR text through
 * the test hatch (mirrors extract.ts __setExtractForTest exactly).
 */

export async function ocrImage(_uri: string): Promise<string> {
  // The native Apple Vision module is not available in this environment yet.
  // When it lands, replace this with the native bridge call. Throwing (rather
  // than returning '') keeps a missing module from silently producing empty
  // extractions.
  throw new Error('OCR native module not available');
}

// --- Test hatch -----------------------------------------------------------------
// Lets the e2e harness substitute deterministic OCR text without a native
// module. Production code paths call ocrImageViaHatch so tests can inject.
type OcrFn = (uri: string) => Promise<string>;
let testOverride: OcrFn | null = null;

export function __setOcrForTest(fn: OcrFn | null): void {
  testOverride = fn;
}

export async function ocrImageViaHatch(uri: string): Promise<string> {
  return (testOverride ?? ocrImage)(uri);
}
