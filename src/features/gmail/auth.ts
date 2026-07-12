import Constants from 'expo-constants';
import { authorize, refresh, type AuthorizeResult } from 'react-native-app-auth';
import { setGmailTokens, type GmailTokens } from '@/services/secrets';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export const GMAIL_REDIRECT_URL = 'trip-os://oauthredirect';

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
    redirectUrl: GMAIL_REDIRECT_URL,
    scopes: [GMAIL_SCOPE],
    usePKCE: true,
  };
}

export function describeGmailAuthorizeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();
  if (lower.includes('invalid_request') || lower.includes('redirect')) {
    return (
      `${message}\n\nCheck the Google Cloud Console iOS OAuth client: bundle id must be ` +
      `com.lizkhoo.tripos and the redirect URI must be exactly ${GMAIL_REDIRECT_URL}.`
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
