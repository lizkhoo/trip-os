import type { AttachmentKind } from '@/services/storage';

/**
 * Classify a URL iOS handed the app through "Open in trip-os" / AirDrop.
 *
 * The app registers as a viewer for PDFs and images (CFBundleDocumentTypes in
 * app.config.ts) with LSSupportsOpeningDocumentsInPlace off, so iOS copies the
 * file into Documents/Inbox/ and opens the app with a `file://` URL. Every other
 * URL the app receives is a deep link (trip-os://…) or an OAuth redirect and
 * belongs to expo-router / react-native-app-auth, not to us.
 *
 * Pure so the routing decision is testable without the native side.
 */

const PDF_EXTENSIONS = ['pdf'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'heic', 'heif', 'webp', 'gif', 'tiff', 'tif'];

export interface IncomingFile {
  uri: string;
  kind: AttachmentKind;
}

export function classifyIncomingFile(url: string): IncomingFile | null {
  if (!url.startsWith('file://')) return null;

  // Strip query/fragment before reading the extension — iOS doesn't add one, but
  // a percent-encoded name with a '?' in it would otherwise fool the match.
  const path = url.split(/[?#]/)[0] ?? '';
  const ext = decodeURIComponent(path).match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!ext) return null;

  if (PDF_EXTENSIONS.includes(ext)) return { uri: url, kind: 'pdf' };
  if (IMAGE_EXTENSIONS.includes(ext)) return { uri: url, kind: 'image' };
  return null;
}
