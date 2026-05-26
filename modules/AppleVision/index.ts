import { requireNativeModule } from 'expo-modules-core';

export interface AppleVisionBlock {
  text: string;
  /** Normalised to the source image: x/y/w/h ∈ [0, 1], origin top-left. */
  bbox: { x: number; y: number; w: number; h: number };
}

export interface AppleVisionResult {
  text: string;
  blocks: AppleVisionBlock[];
}

interface NativeAppleVision {
  recognizeText(uri: string): Promise<AppleVisionResult>;
}

const native = requireNativeModule<NativeAppleVision>('AppleVision');

/**
 * On-device OCR. `uri` must be a `file://` URL or absolute path. PDFs are rasterised
 * page-by-page through PDFKit; text from every page is concatenated in order.
 */
export function recognizeText(uri: string): Promise<AppleVisionResult> {
  return native.recognizeText(uri);
}

export default { recognizeText };
