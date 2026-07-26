import type { ExpoConfig } from 'expo/config';

const googleClientId = process.env.TRIPOS_GOOGLE_CLIENT_ID ?? '';
const googleOAuthGuid = googleClientId.endsWith('.apps.googleusercontent.com')
  ? googleClientId.slice(0, -'.apps.googleusercontent.com'.length)
  : '';
const googleRedirectScheme =
  googleOAuthGuid.length > 0 ? `com.googleusercontent.apps.${googleOAuthGuid}` : null;
// Google authorize() must use scheme:/path (single slash). The react-native-app-auth
// Expo plugin extracts the URL scheme via split('://'), so plugin config needs ://.
const googleRedirectUrlForPlugin = googleRedirectScheme
  ? `${googleRedirectScheme}://oauth2redirect/google`
  : null;

const config: ExpoConfig = {
  name: 'trip-os',
  slug: 'trip-os',
  // Keep trip-os for general deep links; Google OAuth needs the reversed-client-id scheme.
  scheme: googleRedirectScheme ? ['trip-os', googleRedirectScheme] : 'trip-os',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.lizkhoo.tripos',
    appleTeamId: '3933642U9H',
    supportsTablet: false,
    deploymentTarget: '16.4',
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        'trip-os reads screenshots and PDFs of your reservations to build your itinerary.',
      NSCameraUsageDescription:
        'trip-os does not capture photos directly; this entry is reserved for a future scan-to-add feature.',
    },
  },
  android: {
    package: 'com.lizkhoo.tripos',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    // Required for OAuth: patches the generated AppDelegate so the browser
    // redirect resumes the authorize() flow. Without it, connect hangs/fails.
    // Plugin only needs the scheme (: // form); JS authorize uses :/ — see gmailAuth.ts.
    [
      'react-native-app-auth',
      {
        redirectUrls: googleRedirectUrlForPlugin ? [googleRedirectUrlForPlugin] : [],
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'trip-os reads screenshots of your reservations to build your itinerary.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // User-supplied iOS OAuth client id for Gmail. See README for setup.
    googleClientId,
  },
};

export default config;
