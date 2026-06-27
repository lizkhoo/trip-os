import { z } from 'zod';
import { CANDIDATE_STATUSES, RESERVATION_SOURCES } from '@/db/schema';
import { ReservationProposalSchema } from './reservation';

export const ExtractionCandidateSchema = z.object({
  id: z.string().uuid(),
  trip_id: z.string().uuid().optional().nullable(),
  source: z.enum(RESERVATION_SOURCES),
  source_ref: z.string().optional().nullable(),
  raw_text: z.string().optional().nullable(),
  claude_response: z.string().optional().nullable(),
  proposed_reservation: ReservationProposalSchema,
  confidence: z.number().min(0).max(1),
  status: z.enum(CANDIDATE_STATUSES).default('pending'),
  merged_into_reservation_id: z.string().uuid().optional().nullable(),
});

export const ExtractionCandidateInputSchema = ExtractionCandidateSchema.omit({ id: true });

export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;
export type ExtractionCandidateInput = z.infer<typeof ExtractionCandidateInputSchema>;
