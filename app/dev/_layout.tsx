import { Stack } from 'expo-router';
import { headerScreenOptions } from '@/lib/nav';

export default function DevLayout() {
  return (
    <Stack screenOptions={headerScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'trip-os · dev' }} />
      <Stack.Screen name="primitives" options={{ title: 'Primitives' }} />
    </Stack>
  );
}
