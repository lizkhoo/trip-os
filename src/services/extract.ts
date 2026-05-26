import type { ReservationInput } from '@/domain/reservation';
import { getAnthropicKey } from './secrets';

/**
 * Canonical Claude extraction. Tool-use mode with a single tool whose
 * input_schema mirrors ReservationInputSchema (minus caller-set fields), and
 * prompt caching on the frozen system prompt — every call shares the same
 * preamble so a cache read after the first request is ~10x cheaper.
 *
 * Function signatures are load-bearing: Agent 3 (upload + OCR) consumes
 * extractReservationFromAttachment.
 */

export interface ExtractionResult {
  proposed_reservation: ReservationInput;
  confidence: number;
  raw_claude_response: string;
}

export interface EmailExtractionArgs {
  raw_text: string;
  message_id: string;
  /** Optional hint — Gmail-derived trip id when the date matches exactly one trip. */
  hint_trip_id?: string | null;
}

export interface AttachmentExtractionArgs {
  ocr_text: string;
  /** File URIs (local) for the rasterised pages/images Claude vision should look at. */
  image_uris: string[];
  source_ref: string;
  hint_trip_id?: string | null;
}

// Opus 4-7 for email: reasoning-heavy free-text → structured needs the strongest model.
const MODEL_EMAIL = 'claude-opus-4-7';
// Sonnet 4-6 for vision: cheaper + faster on image inputs where OCR text already
// carries most of the signal; vision is just for layout/branding tie-breaks.
const MODEL_VISION = 'claude-sonnet-4-6';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You extract travel reservations from booking confirmation emails and receipts.

Output exactly one structured reservation by calling the extract_reservation tool. Never reply with prose.

CRITICAL RULES
1. Every start_at / end_at MUST be ISO 8601 with an explicit ±HH:MM offset derived from a real IANA timezone (e.g. "2026-03-14T09:02:00-07:00"). Refuse to invent or guess an offset — if the source does not specify a timezone unambiguously (via airport code, property address, station, or printed offset), set confidence ≤ 0.4 and use your best inference, but the IANA timezone MUST be set in details.iana_timezone.
2. Bare-Z timestamps ("2026-03-14T16:02:00Z") are not acceptable — you must convert to the local offset of the relevant location.
3. confidence ∈ [0,1] is your own self-assessment of extraction quality. 0.9+ means every field is unambiguous in the source. Drop to 0.6–0.8 if you had to infer the timezone or guess at a field. Drop below 0.5 if you are stitching together a partial reservation.
4. status defaults to "confirmed" unless the source explicitly says cancelled/voided.

RESERVATION TYPES
- flight: start_at = departure local time. end_at = arrival local time (optional). details: carrier (IATA code preferred, e.g. "AS"), flight_number (digits only, e.g. "338"), depart_iata, arrive_iata, seat, iana_timezone (of departure airport).
- lodging: start_at = check-in local time. end_at = check-out local time. details: property_name, room_type, nights, iana_timezone (of the property).
- dining: start_at = reservation local time. details: cuisine, party_size, iana_timezone (of the restaurant).
- activity: start_at = activity local start. details: operator, category, iana_timezone (of the venue).
- transit (train/bus/ferry/car): start_at = departure local time. details: operator, mode, departure_station, arrival_station, iana_timezone (of departure point).

OMIT optional fields you cannot determine — do not invent values. Title should be a human-readable summary (e.g. "AS 338 RDM → SEA", "Park Hyatt Tokyo — 3 nights").`;

interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

function buildToolSchema(): ToolInputSchema {
  // Mirror of ReservationInputSchema (sans caller-set fields trip_id/source/source_ref).
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['flight', 'lodging', 'dining', 'activity', 'transit'],
      },
      title: { type: 'string', description: 'Human-readable summary.' },
      start_at: {
        type: 'string',
        description: 'ISO 8601 with explicit ±HH:MM offset.',
      },
      end_at: {
        type: ['string', 'null'],
        description: 'ISO 8601 with explicit ±HH:MM offset, or null.',
      },
      confirmation_code: { type: ['string', 'null'] },
      status: {
        type: 'string',
        enum: ['confirmed', 'cancelled'],
        default: 'confirmed',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Self-assessed extraction quality.',
      },
      details: {
        type: 'object',
        description:
          'Type-specific. Flight: {carrier, flight_number, depart_iata?, arrive_iata?, seat?, iana_timezone}. Lodging: {property_name, room_type?, nights?, iana_timezone}. Dining: {cuisine?, party_size?, iana_timezone}. Activity: {operator?, category?, iana_timezone}. Transit: {operator?, mode (train|bus|ferry|car|other), departure_station?, arrival_station?, iana_timezone}.',
        properties: {
          carrier: { type: 'string' },
          flight_number: { type: 'string' },
          depart_iata: { type: 'string' },
          arrive_iata: { type: 'string' },
          seat: { type: 'string' },
          property_name: { type: 'string' },
          room_type: { type: 'string' },
          nights: { type: 'integer' },
          cuisine: { type: 'string' },
          party_size: { type: 'integer' },
          operator: { type: 'string' },
          category: { type: 'string' },
          mode: { type: 'string', enum: ['train', 'bus', 'ferry', 'car', 'other'] },
          departure_station: { type: 'string' },
          arrival_station: { type: 'string' },
          iana_timezone: {
            type: 'string',
            description: 'IANA timezone identifier, e.g. "America/Los_Angeles".',
          },
        },
        required: ['iana_timezone'],
      },
    },
    required: ['type', 'title', 'start_at', 'details', 'confidence'],
    additionalProperties: false,
  };
}

interface ClaudeContentBlock {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason?: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: ClaudeContent;
}

type ClaudeContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | {
          type: 'image';
          source: { type: 'base64'; media_type: string; data: string };
        }
    >;

async function callClaude(
  model: string,
  apiKey: string,
  messages: ClaudeMessage[],
): Promise<ClaudeResponse> {
  const body = {
    model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'extract_reservation',
        description: 'Record the single reservation extracted from the source.',
        input_schema: buildToolSchema(),
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_reservation' },
    messages,
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }
  return (await res.json()) as ClaudeResponse;
}

function pluckToolInput(resp: ClaudeResponse): Record<string, unknown> {
  const block = resp.content.find((b) => b.type === 'tool_use' && b.name === 'extract_reservation');
  if (!block || !block.input) {
    throw new Error('Claude did not invoke extract_reservation');
  }
  return block.input;
}

function toReservationInput(
  toolInput: Record<string, unknown>,
  sourceRef: string,
  source: 'gmail' | 'upload',
  hintTripId: string | null | undefined,
): { proposed: ReservationInput; confidence: number } {
  const confidence = typeof toolInput.confidence === 'number' ? toolInput.confidence : 0;
  // The tool input mirrors ReservationInput minus the caller-set fields; we
  // add them here and let the consumer's Zod parse catch any drift.
  const proposed = {
    ...toolInput,
    trip_id: hintTripId ?? undefined,
    source,
    source_ref: sourceRef,
    confidence,
  } as unknown as ReservationInput;
  return { proposed, confidence };
}

export async function extractReservationFromEmail(
  args: EmailExtractionArgs,
): Promise<ExtractionResult> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new Error('Anthropic API key not set');

  const resp = await callClaude(MODEL_EMAIL, apiKey, [
    {
      role: 'user',
      content: `Extract the reservation from this email. Source message id: ${args.message_id}\n\n---\n${args.raw_text}`,
    },
  ]);

  const toolInput = pluckToolInput(resp);
  const { proposed, confidence } = toReservationInput(
    toolInput,
    args.message_id,
    'gmail',
    args.hint_trip_id,
  );
  return {
    proposed_reservation: proposed,
    confidence,
    raw_claude_response: JSON.stringify(resp),
  };
}

export async function extractReservationFromAttachment(
  args: AttachmentExtractionArgs,
): Promise<ExtractionResult> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new Error('Anthropic API key not set');

  const imageBlocks = await Promise.all(
    args.image_uris.map(async (uri) => {
      const data = await readFileAsBase64(uri);
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: guessMediaType(uri),
          data,
        },
      };
    }),
  );

  const resp = await callClaude(MODEL_VISION, apiKey, [
    {
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `OCR text from the attachment (use as guidance; trust the image when they disagree):\n\n${args.ocr_text}`,
        },
      ],
    },
  ]);

  const toolInput = pluckToolInput(resp);
  const { proposed, confidence } = toReservationInput(
    toolInput,
    args.source_ref,
    'upload',
    args.hint_trip_id,
  );
  return {
    proposed_reservation: proposed,
    confidence,
    raw_claude_response: JSON.stringify(resp),
  };
}

async function readFileAsBase64(uri: string): Promise<string> {
  // Defer the import so Node-side smoke tests don't pull in expo-file-system.
  const FileSystem = await import('expo-file-system');
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

function guessMediaType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

// --- Test hatch -----------------------------------------------------------------
// Lets the smoke test substitute a deterministic implementation without spinning
// up the network. Production code paths import the named exports directly.
interface TestOverrides {
  extractReservationFromEmail?: typeof extractReservationFromEmail;
  extractReservationFromAttachment?: typeof extractReservationFromAttachment;
}
let testOverrides: TestOverrides | null = null;

export function __setExtractForTest(overrides: TestOverrides | null): void {
  testOverrides = overrides;
}

export async function extractReservationFromEmailViaHatch(
  args: EmailExtractionArgs,
): Promise<ExtractionResult> {
  return (testOverrides?.extractReservationFromEmail ?? extractReservationFromEmail)(args);
}

export async function extractReservationFromAttachmentViaHatch(
  args: AttachmentExtractionArgs,
): Promise<ExtractionResult> {
  return (testOverrides?.extractReservationFromAttachment ?? extractReservationFromAttachment)(
    args,
  );
}
