import { Stack } from 'expo-router';

export default function DevLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fbf7f0' },
        headerTintColor: '#1f1a17',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'trip-os · dev' }} />
      <Stack.Screen name="primitives" options={{ title: 'Primitives' }} />
    </Stack>
  );
}
