import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, type Attachment } from '@/db/schema';

export async function getAttachmentByExtractionRunId(
  runId: string,
): Promise<Attachment | undefined> {
  const row = await db
    .select()
    .from(attachments)
    .where(eq(attachments.extractionRunId, runId))
    .get();
  return row ?? undefined;
}
