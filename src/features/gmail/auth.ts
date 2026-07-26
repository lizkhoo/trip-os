import Constants from 'expo-constants';
import { authorize, refresh, type AuthorizeResult } from 'react-native-app-auth';
import { setGmailTokens, type GmailTokens } from '@/services/secrets';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** Prefer `@/services/gmailAuth` — this module is a legacy duplicate kept in sync. */
function gmailRedirectUrl(clientId: string): string {
  if (!clientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(`Unexpected Google client id (expected *${GOOGLE_CLIENT_ID_SUFFIX}).`);
  }
  const guid = clientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  return `com.googleusercontent.apps.${guid}:/oauth2redirect/google`;
}

export const CLIENT_ID_MISSING_MESSAGE =
  'This build has no Google OAuth client id. Set TRIPOS_GOOGLE_CLIENT_ID (see README "Gmail setup"), ' +
  'then rebuild the app — the id is baked in at build time.';

export class GoogleClientIdMissingError extends Error {
  constructor() {
    super(CLIENT_ID_MISSING_MESSAGE);
    this.name = 'GoogleClientIdMissingError';
  }
}

export function getConfiguredGoogleClientId(): string | null {
  const id = Constants.expoConfig?.extra?.googleClientId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function authConfig(clientId: string) {
  return {
    issuer: 'https://accounts.google.com',
    clientId,
    redirectUrl: gmailRedirectUrl(clientId),
    scopes: [GMAIL_SCOPE],
    usePKCE: true,
  };
}

export function describeGmailAuthorizeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();
  if (lower.includes('invalid_request') || lower.includes('redirect') || lower.includes('compliance')) {
    const clientId = getConfiguredGoogleClientId();
    const expected = clientId
      ? gmailRedirectUrl(clientId)
      : 'com.googleusercontent.apps.<CLIENT_GUID>:/oauth2redirect/google';
    return (
      `${message}\n\nGoogle iOS OAuth requires redirect URI ${expected} ` +
      `(reversed client id; not trip-os://…). Bundle id must be com.lizkhoo.tripos.`
    );
  }
  if (lower.includes('access_denied') || lower.includes('cancel')) {
    return 'Sign-in was cancelled or denied. Try again and approve the Gmail read-only scope.';
  }
  return message;
}

export interface ConnectGmailResult {
  tokens: GmailTokens;
  missingRefreshToken: boolean;
}

export async function connectGmail(): Promise<ConnectGmailResult> {
  const clientId = getConfiguredGoogleClientId();
  if (!clientId) throw new GoogleClientIdMissingError();

  const result: AuthorizeResult = await authorize(authConfig(clientId));
  const tokens: GmailTokens = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    accessTokenExpirationDate: result.accessTokenExpirationDate,
    scopes: result.scopes,
  };
  await setGmailTokens(tokens);
  return { tokens, missingRefreshToken: !result.refreshToken };
}

export async function refreshGmailTokens(tokens: GmailTokens): Promise<GmailTokens> {
  const clientId = getConfiguredGoogleClientId();
  if (!clientId) throw new GoogleClientIdMissingError();
  if (!tokens.refreshToken) {
    throw new Error(
      'This connection has no refresh token. Disconnect and reconnect Gmail to get one.',
    );
  }
  const r = await refresh(authConfig(clientId), { refreshToken: tokens.refreshToken });
  const updated: GmailTokens = {
    ...tokens,
    accessToken: r.accessToken,
    accessTokenExpirationDate: r.accessTokenExpirationDate,
  };
  await setGmailTokens(updated);
  return updated;
}
