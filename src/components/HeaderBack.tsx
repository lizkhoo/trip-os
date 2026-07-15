import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { color } from '@/theme/tokens';

// Explicit header back action for screens that are entered cross-group (e.g.
// Settings / Connect / Review pushed from the consumer stack). Those screens are
// the first route of the (admin) stack, so the native stack renders no automatic
// back button — `router.back()` still pops the root history correctly.
export function HeaderBack() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={12}>
      <Text style={{ color: color.brand, fontSize: 17 }}>‹ Back</Text>
    </Pressable>
  );
}
