import { z } from 'zod';
import { hasOffset } from '@/lib/time';
import {
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  RESERVATION_TYPES,
} from '@/db/schema';

/**
 * Reservations are stored with their IANA-zone offset baked into start_at / end_at.
 * Refuse zoneless strings — Claude will hallucinate timezones if we let it.
 */
const IsoWithOffset = z
  .string()
  .refine(hasOffset, { message: 'Timestamp must include an explicit ±HH:MM offset' });

export const FlightDetailsSchema = z.object({
  carrier: z.string().min(1),
  flight_number: z.string().min(1),
  depart_iata: z.string().length(3).optional(),
  arrive_iata: z.string().length(3).optional(),
  seat: z.string().optional(),
  iana_timezone: z.string().min(1),
});

export const LodgingDetailsSchema = z.object({
  property_name: z.string().min(1),
  room_type: z.string().optional(),
  nights: z.number().int().positive().optional(),
  iana_timezone: z.string().min(1),
});

export const DiningDetailsSchema = z.object({
  cuisine: z.string().optional(),
  party_size: z.number().int().positive().optional(),
  iana_timezone: z.string().min(1),
});

export const ActivityDetailsSchema = z.object({
  operator: z.string().optional(),
  category: z.string().optional(),
  iana_timezone: z.string().min(1),
});

export const TransitDetailsSchema = z.object({
  operator: z.string().optional(),
  mode: z.enum(['train', 'bus', 'ferry', 'car', 'other']).default('other'),
  departure_station: z.string().optional(),
  arrival_station: z.string().optional(),
  iana_timezone: z.string().min(1),
});

const BaseFields = {
  id: z.string().uuid(),
  trip_id: z.string().uuid(),
  title: z.string().min(1),
  start_at: IsoWithOffset,
  end_at: IsoWithOffset.optional().nullable(),
  start_location_id: z.string().uuid().optional().nullable(),
  end_location_id: z.string().uuid().optional().nullable(),
  confirmation_code: z.string().optional().nullable(),
  source: z.enum(RESERVATION_SOURCES),
  source_ref: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  status: z.enum(RESERVATION_STATUSES).default('confirmed'),
  manually_edited_at: IsoWithOffset.optional().nullable(),
};

export const FlightReservationSchema = z.object({
  ...BaseFields,
  type: z.literal('flight'),
  details: FlightDetailsSchema,
});

export const LodgingReservationSchema = z.object({
  ...BaseFields,
  type: z.literal('lodging'),
  details: LodgingDetailsSchema,
});

export const DiningReservationSchema = z.object({
  ...BaseFields,
  type: z.literal('dining'),
  details: DiningDetailsSchema,
});

export const ActivityReservationSchema = z.object({
  ...BaseFields,
  type: z.literal('activity'),
  details: ActivityDetailsSchema,
});

export const TransitReservationSchema = z.object({
  ...BaseFields,
  type: z.literal('transit'),
  details: TransitDetailsSchema,
});

export const ReservationSchema = z.discriminatedUnion('type', [
  FlightReservationSchema,
  LodgingReservationSchema,
  DiningReservationSchema,
  ActivityReservationSchema,
  TransitReservationSchema,
]);

export type Reservation = z.infer<typeof ReservationSchema>;
export type ReservationType = (typeof RESERVATION_TYPES)[number];

// Inputs drop the id and let the service layer mint the uuid.
const InputFields = {
  trip_id: BaseFields.trip_id,
  title: BaseFields.title,
  start_at: BaseFields.start_at,
  end_at: BaseFields.end_at,
  start_location_id: BaseFields.start_location_id,
  end_location_id: BaseFields.end_location_id,
  confirmation_code: BaseFields.confirmation_code,
  source: BaseFields.source,
  source_ref: BaseFields.source_ref,
  confidence: BaseFields.confidence,
  status: BaseFields.status.optional(),
};

export const ReservationInputSchema = z.discriminatedUnion('type', [
  z.object({ ...InputFields, type: z.literal('flight'), details: FlightDetailsSchema }),
  z.object({ ...InputFields, type: z.literal('lodging'), details: LodgingDetailsSchema }),
  z.object({ ...InputFields, type: z.literal('dining'), details: DiningDetailsSchema }),
  z.object({ ...InputFields, type: z.literal('activity'), details: ActivityDetailsSchema }),
  z.object({ ...InputFields, type: z.literal('transit'), details: TransitDetailsSchema }),
]);

export type ReservationInput = z.infer<typeof ReservationInputSchema>;

// Proposals are what Claude returns and what extraction_candidates store: an
// unassigned reservation. The trip_id lives on the candidate row itself (auto-
// assigned by the orchestrator, or chosen by the user at accept time), and
// acceptCandidate merges it back in before calling createReservation.
const ProposalFields = {
  title: BaseFields.title,
  start_at: BaseFields.start_at,
  end_at: BaseFields.end_at,
  start_location_id: BaseFields.start_location_id,
  end_location_id: BaseFields.end_location_id,
  confirmation_code: BaseFields.confirmation_code,
  source: BaseFields.source,
  source_ref: BaseFields.source_ref,
  confidence: BaseFields.confidence,
  status: BaseFields.status.optional(),
};

export const ReservationProposalSchema = z.discriminatedUnion('type', [
  z.object({ ...ProposalFields, type: z.literal('flight'), details: FlightDetailsSchema }),
  z.object({ ...ProposalFields, type: z.literal('lodging'), details: LodgingDetailsSchema }),
  z.object({ ...ProposalFields, type: z.literal('dining'), details: DiningDetailsSchema }),
  z.object({ ...ProposalFields, type: z.literal('activity'), details: ActivityDetailsSchema }),
  z.object({ ...ProposalFields, type: z.literal('transit'), details: TransitDetailsSchema }),
]);

export type ReservationProposal = z.infer<typeof ReservationProposalSchema>;
