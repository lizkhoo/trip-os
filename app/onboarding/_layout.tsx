import { Stack } from 'expo-router';
import { headerScreenOptions } from '@/lib/nav';

export default function OnboardingLayout() {
  return <Stack screenOptions={headerScreenOptions} />;
}
