import { Stack } from 'expo-router';

// Admin surface is empty in Foundation. Agents 2 & 3 will populate /connect, /upload, /review.
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
