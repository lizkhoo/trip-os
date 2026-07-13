import type { ExpoConfig } from 'expo/config';

/**
 * Google iOS OAuth expects the reversed-client-id redirect, not an arbitrary
 * custom scheme like trip-os://. Format per react-native-app-auth + Google:
 *   com.googleusercontent.apps.{GUID}:/oauth2redirect/google
 * The Expo plugin must register the scheme at prebuild — set
 * TRIPOS_GOOGLE_CLIENT_ID before `npx expo prebuild`.
 */
const googleClientId = process.env.TRIPOS_GOOGLE_CLIENT_ID ?? '';
const googleAppGuid = googleClientId.endsWith('.apps.googleusercontent.com')
  ? googleClientId.slice(0, -'.apps.googleusercontent.com'.length)
  : '';
const googleRedirectUrl = googleAppGuid
  ? `com.googleusercontent.apps.${googleAppGuid}:/oauth2redirect/google`
  : '';
const googleUrlScheme = googleAppGuid
  ? `com.googleusercontent.apps.${googleAppGuid}`
  : 'trip-os';

const config: ExpoConfig = {
  name: 'trip-os',
  slug: 'trip-os',
  scheme: 'trip-os',
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
    // Required for OAuth: patches AppDelegate + registers the Google reverse-client-id
    // URL scheme so ASWebAuthenticationSession can resume authorize().
    [
      'react-native-app-auth',
      {
        redirectUrls: googleRedirectUrl
          ? [googleRedirectUrl]
          : ['trip-os://oauthredirect'],
        // Explicit schemes — Google uses `scheme:/path` (one slash), so the plugin's
        // redirectUrls[0].split('://') extraction would not work alone.
        ios: { urlScheme: googleUrlScheme },
        android: { appAuthRedirectScheme: googleUrlScheme },
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
    googleRedirectUrl,
  },
};

export default config;
