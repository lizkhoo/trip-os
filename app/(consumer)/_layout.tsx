import { Stack } from 'expo-router';

// Consumer surface is empty in Foundation. Agent 4 will replace this with a tab navigator.
export default function ConsumerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
