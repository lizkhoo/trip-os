/**
 * OCR boundary. Production `ocrImage` calls the local Apple Vision expo module
 * (modules/AppleVision — VNRecognizeTextRequest, with PDFKit rasterization for
 * PDFs) to pull text out of a screenshot/PDF. The e2e harness injects
 * deterministic OCR text through the test hatch (mirrors extract.ts
 * __setExtractForTest exactly).
 */

// Deferred so importing this module under Node (e2e runner / smoke) never loads
// expo-modules-core's native bridge. Mirrors storage.ts / secrets.ts deferral.
async function loadAppleVision(): Promise<typeof import('../../modules/AppleVision')> {
  try {
    return await import('../../modules/AppleVision');
  } catch (err) {
    throw new Error(
      'OCR native module not available — run a development build (pnpm ios) so ' +
        `the AppleVision module is compiled in. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

export async function ocrImage(uri: string): Promise<string> {
  const vision = await loadAppleVision();
  const result = await vision.recognizeText(uri);
  return result.text;
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
