import Constants from 'expo-constants';
import { authorize, type AuthorizeResult } from 'react-native-app-auth';
import { setGmailTokens, type GmailTokens } from '@/services/secrets';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** GUID portion of an iOS client id (everything before `.apps.googleusercontent.com`). */
export function googleOAuthAppGuid(clientId: string): string {
  if (!clientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(
      `Unexpected Google client id (expected *${GOOGLE_CLIENT_ID_SUFFIX}).`,
    );
  }
  return clientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
}

/**
 * Google iOS OAuth clients accept the reversed-client-id custom scheme only.
 * Format (single slash after colon): `com.googleusercontent.apps.<GUID>:/oauth2redirect/google`
 * See react-native-app-auth Google docs + AppAuth-iOS Google example.
 */
export function gmailRedirectUrl(clientId: string): string {
  return `com.googleusercontent.apps.${googleOAuthAppGuid(clientId)}:/oauth2redirect/google`;
}

export function getConfiguredGoogleClientId(): string | null {
  const id = Constants.expoConfig?.extra?.googleClientId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function gmailAuthConfig(clientId: string) {
  return {
    issuer: 'https://accounts.google.com',
    clientId,
    redirectUrl: gmailRedirectUrl(clientId),
    scopes: [GMAIL_SCOPE],
    usePKCE: true,
  };
}

export const GMAIL_CLIENT_ID_MISSING_MESSAGE =
  'This build has no Google OAuth client id. Set TRIPOS_GOOGLE_CLIENT_ID (see README "Gmail setup"), ' +
  'then rebuild the app — the id is baked in at build time.';

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
      `(reversed client id; not trip-os://…). Bundle id must be com.lizkhoo.tripos. ` +
      `Rebuild after changing TRIPOS_GOOGLE_CLIENT_ID so the URL scheme is registered.`
    );
  }
  if (lower.includes('access_denied') || lower.includes('cancel')) {
    return 'Sign-in was cancelled or denied. Try again and approve the Gmail read-only scope.';
  }
  return message;
}

export interface GmailConnectResult {
  tokens: GmailTokens;
  missingRefreshToken: boolean;
}

export async function connectGmail(): Promise<GmailConnectResult> {
  const clientId = getConfiguredGoogleClientId();
  if (!clientId) {
    throw new Error(GMAIL_CLIENT_ID_MISSING_MESSAGE);
  }
  const result: AuthorizeResult = await authorize(gmailAuthConfig(clientId));
  const tokens: GmailTokens = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    accessTokenExpirationDate: result.accessTokenExpirationDate,
    scopes: result.scopes,
  };
  await setGmailTokens(tokens);
  return { tokens, missingRefreshToken: !result.refreshToken };
}
