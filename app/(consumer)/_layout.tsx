import { Stack } from 'expo-router';
import { headerScreenOptions } from '@/lib/nav';

// Native large-title headers (Georgia serif) give safe-area-correct chrome and an
// automatic back button for free. Each screen sets its own `title` / header
// actions via a <Stack.Screen> element.
export default function ConsumerLayout() {
  return <Stack screenOptions={headerScreenOptions} />;
}
