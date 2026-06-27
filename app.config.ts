import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'trip-os',
  slug: 'trip-os',
  scheme: 'trip-os',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.lizkhoo.tripos',
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
    googleClientId: process.env.TRIPOS_GOOGLE_CLIENT_ID ?? '',
  },
};

export default config;
