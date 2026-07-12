import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fbf7f0' },
        headerTitleStyle: { fontFamily: 'Georgia' },
        headerShadowVisible: false,
      }}
    />
  );
}
