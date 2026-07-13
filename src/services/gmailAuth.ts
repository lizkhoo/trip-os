import Constants from 'expo-constants';
import { authorize, type AuthorizeResult } from 'react-native-app-auth';
import { setGmailTokens, type GmailTokens } from '@/services/secrets';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** Legacy custom scheme — do not use for Google; kept only for error copy / migration notes. */
export const GMAIL_LEGACY_REDIRECT_URL = 'trip-os://oauthredirect';

export function googleAppGuidFromClientId(clientId: string): string | null {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) return null;
  const guid = clientId.slice(0, -suffix.length);
  return guid.length > 0 ? guid : null;
}

/**
 * Google's installed-app redirect for an iOS OAuth client.
 * Must match the reverse client id scheme registered in Info.plist at prebuild.
 * @see https://commerce.nearform.com/open-source/react-native-app-auth/docs/providers/google
 */
export function gmailRedirectUrlFromClientId(clientId: string): string {
  const guid = googleAppGuidFromClientId(clientId);
  if (!guid) {
    throw new Error(
      `Google client id must end with .apps.googleusercontent.com (got "${clientId}").`,
    );
  }
  return `com.googleusercontent.apps.${guid}:/oauth2redirect/google`;
}

export function getConfiguredGoogleClientId(): string | null {
  const id = Constants.expoConfig?.extra?.googleClientId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function getConfiguredGmailRedirectUrl(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.googleRedirectUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const clientId = getConfiguredGoogleClientId();
  if (!clientId) return null;
  try {
    return gmailRedirectUrlFromClientId(clientId);
  } catch {
    return null;
  }
}

export function gmailAuthConfig(clientId: string, redirectUrl: string) {
  return {
    issuer: 'https://accounts.google.com',
    clientId,
    redirectUrl,
    scopes: [GMAIL_SCOPE],
    usePKCE: true,
    // Offline + consent so Google returns a refresh token on first connect.
    additionalParameters: {
      access_type: 'offline',
      prompt: 'consent' as const,
    },
  };
}

export const GMAIL_CLIENT_ID_MISSING_MESSAGE =
  'This build has no Google OAuth client id. Set TRIPOS_GOOGLE_CLIENT_ID (see README "Gmail setup"), ' +
  'then rebuild the app — the id and redirect URL scheme are baked in at prebuild/build time.';

export function describeGmailAuthorizeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();
  if (
    lower.includes('invalid_request') ||
    lower.includes('redirect') ||
    lower.includes("doesn't meet") ||
    lower.includes('does not meet') ||
    lower.includes("doesn't comply") ||
    lower.includes('does not comply') ||
    lower.includes('oauth 2.0 policy')
  ) {
    const redirect = getConfiguredGmailRedirectUrl() ?? 'com.googleusercontent.apps.<GUID>:/oauth2redirect/google';
    return (
      `${message}\n\nGoogle requires the reversed-client-id redirect (not trip-os://). ` +
      `Cloud Console: OAuth client type iOS, bundle id com.lizkhoo.tripos. ` +
      `App redirect must be exactly ${redirect}. ` +
      `Rebuild after setting TRIPOS_GOOGLE_CLIENT_ID: ` +
      `npx expo prebuild --platform ios --clean && npx expo run:ios --device.`
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
  const redirectUrl = getConfiguredGmailRedirectUrl();
  if (!redirectUrl) {
    throw new Error(
      'This build has no Google OAuth redirect URL. Set TRIPOS_GOOGLE_CLIENT_ID before prebuild ' +
        'so the reversed-client-id scheme is registered, then rebuild.',
    );
  }
  const result: AuthorizeResult = await authorize(gmailAuthConfig(clientId, redirectUrl));
  const tokens: GmailTokens = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? '',
    accessTokenExpirationDate: result.accessTokenExpirationDate,
    scopes: result.scopes,
  };
  await setGmailTokens(tokens);
  return { tokens, missingRefreshToken: !result.refreshToken };
}
