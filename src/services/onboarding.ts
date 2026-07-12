const ONBOARDING_KEY = 'tripos.onboardingComplete';

async function secureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

export async function isOnboardingComplete(): Promise<boolean> {
  const raw = await (await secureStore()).getItemAsync(ONBOARDING_KEY);
  return raw === '1';
}

export async function setOnboardingComplete(): Promise<void> {
  await (await secureStore()).setItemAsync(ONBOARDING_KEY, '1');
}

export async function clearOnboardingComplete(): Promise<void> {
  await (await secureStore()).deleteItemAsync(ONBOARDING_KEY);
}
