import { Stack } from 'expo-router';
import { headerScreenOptions } from '@/lib/nav';

// Native large-title headers (Georgia serif) — see app/(consumer)/_layout.tsx.
export default function AdminLayout() {
  return <Stack screenOptions={headerScreenOptions} />;
}
