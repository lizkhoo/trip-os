import { Directory, File, Paths } from 'expo-file-system';
import { newUuid } from '@/lib/uuid';

export type AttachmentKind = 'pdf' | 'image';

function extForKind(kind: AttachmentKind, sourceUri: string): string {
  const fromUri = sourceUri.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase();
  if (fromUri) return fromUri;
  return kind === 'pdf' ? 'pdf' : 'jpg';
}

function ensureMonthDir(): Directory {
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
  const dir = ensureMonthDir();
  const dest = new File(dir, `${newUuid()}.${extForKind(kind, sourceUri)}`);
  const src = new File(sourceUri);
  if (opts.move) {
    await src.move(dest);
  } else {
    await src.copy(dest);
  }
  return dest.uri;
}

export function get(uri: string): { exists: boolean; size: number } {
  const file = new File(uri);
  return { exists: file.exists, size: file.size };
}

export function remove(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
