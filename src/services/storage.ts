import { newUuid } from '@/lib/uuid';

export type AttachmentKind = 'pdf' | 'image';

function extForKind(kind: AttachmentKind, sourceUri: string): string {
  const fromUri = sourceUri.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase();
  if (fromUri) return fromUri;
  return kind === 'pdf' ? 'pdf' : 'jpg';
}

// Defer the expo-file-system import so importing this module under Node (the e2e
// runner / smoke) never loads the native module. Mirrors extract.ts's
// readFileAsBase64 deferral.
type FileSystemModule = typeof import('expo-file-system');

async function loadFileSystem(): Promise<FileSystemModule> {
  return import('expo-file-system');
}

async function ensureMonthDir(
  fs: FileSystemModule,
): Promise<InstanceType<FileSystemModule['Directory']>> {
  const { Directory, Paths } = fs;
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const root = new Directory(Paths.document, 'uploads');
  if (!root.exists) root.create({ intermediates: true });
  const year = new Directory(root, yyyy);
  if (!year.exists) year.create({ intermediates: true });
  const month = new Directory(year, mm);
  if (!month.exists) month.create({ intermediates: true });
  return month;
}

export interface PutOptions {
  /** When true, move the source file; otherwise copy. Default: copy. */
  move?: boolean;
}

export async function put(
  sourceUri: string,
  kind: AttachmentKind,
  opts: PutOptions = {},
): Promise<string> {
  const fs = await loadFileSystem();
  const { File } = fs;
  const dir = await ensureMonthDir(fs);
  const dest = new File(dir, `${newUuid()}.${extForKind(kind, sourceUri)}`);
  const src = new File(sourceUri);
  if (opts.move) {
    await src.move(dest);
  } else {
    await src.copy(dest);
  }
  return dest.uri;
}

export async function get(uri: string): Promise<{ exists: boolean; size: number }> {
  const fs = await loadFileSystem();
  const file = new fs.File(uri);
  return { exists: file.exists, size: file.size ?? 0 };
}

export async function remove(uri: string): Promise<void> {
  const fs = await loadFileSystem();
  const file = new fs.File(uri);
  if (file.exists) file.delete();
}

// --- Test hatch -----------------------------------------------------------------
// Lets the e2e harness substitute a deterministic in-memory storage without
// touching expo-file-system. Mirrors extract.ts __setExtractForTest. Production
// code paths import the named exports directly; orchestrators call the *ViaHatch
// wrappers so tests can inject.
interface StorageOverrides {
  put?: typeof put;
  get?: typeof get;
  remove?: typeof remove;
}
let testOverrides: StorageOverrides | null = null;

export function __setStorageForTest(overrides: StorageOverrides | null): void {
  testOverrides = overrides;
}

export async function putViaHatch(
  sourceUri: string,
  kind: AttachmentKind,
  opts: PutOptions = {},
): Promise<string> {
  return (testOverrides?.put ?? put)(sourceUri, kind, opts);
}

export async function getViaHatch(uri: string): Promise<{ exists: boolean; size: number }> {
  return (testOverrides?.get ?? get)(uri);
}

export async function removeViaHatch(uri: string): Promise<void> {
  return (testOverrides?.remove ?? remove)(uri);
}
