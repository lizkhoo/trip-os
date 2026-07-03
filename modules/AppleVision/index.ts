import { requireNativeModule } from 'expo-modules-core';

/** A single recognized text block with its Vision-normalized bounding box. */
export interface OcrBlock {
  text: string;
  /** Normalized [0,1] coordinates, origin bottom-left (Vision convention). */
  bbox: { x: number; y: number; width: number; height: number };
}

export interface OcrResult {
  /** Full recognized text; PDF pages are concatenated with blank lines. */
  text: string;
  blocks: OcrBlock[];
}

interface AppleVisionNativeModule {
  recognizeText(uri: string): Promise<OcrResult>;
}

const AppleVision = requireNativeModule<AppleVisionNativeModule>('AppleVision');

/**
 * OCR a local file (image or PDF) with Apple Vision (VNRecognizeTextRequest).
 * PDFs are rasterized page-by-page with PDFKit before recognition.
 */
export async function recognizeText(uri: string): Promise<OcrResult> {
  return AppleVision.recognizeText(uri);
}
