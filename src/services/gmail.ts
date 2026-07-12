import { getGmailTokens, setGmailTokens, type GmailTokens } from './secrets';

/**
 * Minimal Gmail REST client. We avoid `googleapis` — it's huge, and we only
 * need three endpoints. Token refresh is internal: on 401 we hit Google's
 * OAuth token endpoint with the refresh token, persist the new access token,
 * and retry once.
 *
 * The OAuth client id is read from app.config extra; the refresh grant on a
 * native iOS PKCE flow does not require a client secret.
 */

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  bodyText: string;
  date: string;
  snippet: string;
}

export interface GmailAttachment {
  bytes: string;
  mimeType: string;
}

/**
 * Surface attachment metadata so callers can pick the right MIME before
 * pulling the bytes. Gmail only ships MIME on the parent message's part
 * tree — the /attachments/:id endpoint returns raw bytes only.
 */
export interface GmailAttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
}

export interface GmailProfile {
  historyId: string;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailProfileResponse {
  emailAddress?: string;
  historyId?: string;
  messagesTotal?: number;
  threadsTotal?: number;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface GmailAttachmentResponse {
  size: number;
  data: string;
}

function getClientId(): string {
  // Loaded from app.config.ts extra. The user pastes their own in README setup.
  // Deferred require so importing this module never pulls in expo-constants
  // (which can't load under Node); only the live OAuth refresh path reaches here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = (require('expo-constants') as { default: typeof import('expo-constants').default }).default;
  const id = Constants.expoConfig?.extra?.googleClientId;
  if (!id || typeof id !== 'string') {
    throw new Error(
      'googleClientId not set in app.config.ts extra — paste your iOS OAuth client id (see README).',
    );
  }
  return id;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const tokens = await getGmailTokens();
  if (!tokens) throw new Error('Gmail not connected');

  const doRequest = async (accessToken: string) =>
    fetch(`${GMAIL_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let res = await doRequest(tokens.accessToken);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken(tokens);
    res = await doRequest(refreshed.accessToken);
  }
  return res;
}

async function refreshAccessToken(tokens: GmailTokens): Promise<GmailTokens> {
  if (!tokens.refreshToken) {
    throw new Error(
      'Gmail access token expired and no refresh token is stored — disconnect and reconnect Gmail.',
    );
  }
  const params = new URLSearchParams({
    client_id: getClientId(),
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };
  const updated: GmailTokens = {
    ...tokens,
    accessToken: json.access_token,
    accessTokenExpirationDate: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scopes: json.scope ? json.scope.split(' ') : tokens.scopes,
  };
  await setGmailTokens(updated);
  return updated;
}

export async function searchMessageIds(query: string, after?: string): Promise<string[]> {
  // Gmail's `q` already supports `after:YYYY/MM/DD` style operators. The `after`
  // parameter on this function is a Gmail-shaped date string the orchestrator
  // assembles from `lastSyncedAt`.
  const q = after ? `${query} after:${after}` : query;
  const out: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const path = `${url.pathname.replace('/gmail/v1/users/me', '')}?${url.searchParams.toString()}`;
    const res = await authedFetch(path);
    if (!res.ok) {
      throw new Error(`Gmail search failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as GmailListResponse;
    for (const m of json.messages ?? []) out.push(m.id);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export async function fetchMessage(id: string): Promise<GmailMessageSummary> {
  const res = await authedFetch(`/messages/${id}?format=full`);
  if (!res.ok) {
    throw new Error(`Gmail fetchMessage failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GmailMessageResponse;
  const headers = json.payload?.headers ?? [];
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
  const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value ?? '';
  const bodyText = extractBodyText(json.payload);
  return { id: json.id, subject, from, bodyText, date, snippet: json.snippet ?? '' };
}

function extractBodyText(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  // Prefer text/plain. Fall back to text/html stripped to text. Recurse on multipart.
  const plain = findPart(part, 'text/plain');
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = findPart(part, 'text/html');
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  if (part.body?.data) return decodeBase64Url(part.body.data);
  return '';
}

function findPart(part: GmailMessagePart, mime: string): GmailMessagePart | undefined {
  if (part.mimeType === mime) return part;
  for (const sub of part.parts ?? []) {
    const hit = findPart(sub, mime);
    if (hit) return hit;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(data.length / 4) * 4, '=');
  // atob is available in RN/Hermes; for Node tests we'd polyfill, but this code
  // only runs in the app.
  if (typeof atob === 'function') {
    const bin = atob(padded);
    try {
      // Best-effort UTF-8 decode.
      return decodeURIComponent(escape(bin));
    } catch {
      return bin;
    }
  }
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch the raw bytes for an attachment. Gmail's /attachments/:id endpoint
 * doesn't echo MIME, so the caller is responsible for passing the mimeType
 * read from the parent message's part metadata — call `listAttachments`
 * first if you don't already have it.
 */
export async function getAttachment(
  messageId: string,
  attachmentId: string,
  mimeType: string,
): Promise<GmailAttachment> {
  const res = await authedFetch(`/messages/${messageId}/attachments/${attachmentId}`);
  if (!res.ok) {
    throw new Error(`Gmail getAttachment failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GmailAttachmentResponse;
  return {
    bytes: json.data.replace(/-/g, '+').replace(/_/g, '/'),
    mimeType,
  };
}

/**
 * Walk the message's part tree and return metadata for every part that has
 * an attachmentId. Use this to look up the MIME for getAttachment.
 */
export async function listAttachments(messageId: string): Promise<GmailAttachmentMeta[]> {
  const res = await authedFetch(`/messages/${messageId}?format=full`);
  if (!res.ok) {
    throw new Error(`Gmail listAttachments failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GmailMessageResponse;
  const out: GmailAttachmentMeta[] = [];
  const walk = (part?: GmailMessagePart) => {
    if (!part) return;
    if (part.body?.attachmentId) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename ?? '',
        mimeType: part.mimeType ?? 'application/octet-stream',
      });
    }
    for (const sub of part.parts ?? []) walk(sub);
  };
  walk(json.payload);
  return out;
}

/**
 * Return the user's current Gmail history id — used by sync state to mark
 * the "we've caught up to here" cursor for future history.list calls.
 */
export async function getProfile(): Promise<GmailProfile> {
  const res = await authedFetch(`/profile`);
  if (!res.ok) {
    throw new Error(`Gmail getProfile failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GmailProfileResponse;
  if (!json.historyId) {
    throw new Error('Gmail getProfile: response missing historyId');
  }
  return { historyId: json.historyId };
}

// --- Test hatch -----------------------------------------------------------------
export interface GmailAdapter {
  searchMessageIds: typeof searchMessageIds;
  fetchMessage: typeof fetchMessage;
  getAttachment: typeof getAttachment;
  listAttachments: typeof listAttachments;
  getProfile: typeof getProfile;
}

let testAdapter: GmailAdapter | null = null;

export function __setGmailForTest(adapter: GmailAdapter | null): void {
  testAdapter = adapter;
}

export async function searchMessageIdsViaHatch(query: string, after?: string): Promise<string[]> {
  return (testAdapter?.searchMessageIds ?? searchMessageIds)(query, after);
}

export async function fetchMessageViaHatch(id: string): Promise<GmailMessageSummary> {
  return (testAdapter?.fetchMessage ?? fetchMessage)(id);
}

export async function getAttachmentViaHatch(
  messageId: string,
  attachmentId: string,
  mimeType: string,
): Promise<GmailAttachment> {
  return (testAdapter?.getAttachment ?? getAttachment)(messageId, attachmentId, mimeType);
}

export async function listAttachmentsViaHatch(messageId: string): Promise<GmailAttachmentMeta[]> {
  return (testAdapter?.listAttachments ?? listAttachments)(messageId);
}

export async function getProfileViaHatch(): Promise<GmailProfile> {
  return (testAdapter?.getProfile ?? getProfile)();
}
