import { Stack } from 'expo-router';

export default function ConsumerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fbf7f0' },
        headerTitleStyle: { fontFamily: 'Georgia', fontSize: 18 },
        headerTintColor: '#1f1a17',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Trips' }} />
      <Stack.Screen name="trips/new" options={{ title: 'New trip', presentation: 'modal' }} />
      <Stack.Screen name="trips/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="trips/[id]/map" options={{ title: 'Map' }} />
      <Stack.Screen
        name="trips/[id]/edit"
        options={{ title: 'Edit trip', presentation: 'modal' }}
      />
    </Stack>
  );
}
