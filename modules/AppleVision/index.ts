import { requireNativeModule } from 'expo-modules-core';

export interface AppleVisionBlock {
  text: string;
  /** Normalised to the source image: x/y/w/h ∈ [0, 1], origin top-left. */
  bbox: { x: number; y: number; w: number; h: number };
}

export interface AppleVisionResult {
  text: string;
  blocks: AppleVisionBlock[];
  /**
   * file:// URLs of the pixels OCR ran on, one per page. For raw images this is a single
   * entry pointing at the source URI; for PDFs it's one PNG per page written under
   * NSTemporaryDirectory. Feed these to Claude vision so it sees what OCR saw.
   */
  pageImageUris: string[];
}

interface NativeAppleVision {
  recognizeText(uri: string): Promise<AppleVisionResult>;
}

const native = requireNativeModule<NativeAppleVision>('AppleVision');

/**
 * On-device OCR. `uri` must be a `file://` URL or absolute path. PDFs are rasterised
 * page-by-page through PDFKit; text from every page is concatenated in order and each
 * rasterised page is returned as a file:// PNG in `pageImageUris`.
 */
export function recognizeText(uri: string): Promise<AppleVisionResult> {
  return native.recognizeText(uri);
}

export default { recognizeText };
