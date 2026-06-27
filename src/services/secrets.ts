const ANTHROPIC_KEY = 'tripos.anthropicApiKey';
const GMAIL_TOKENS_KEY = 'tripos.gmailTokens';

// Deferred so importing this module never pulls in expo-secure-store (and its
// expo-modules-core native bridge), which can't load under Node. Production code
// reaches it; Node-side tests short-circuit via the test hatch before this runs.
async function secureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpirationDate: string;
  scopes: string[];
}

export async function getAnthropicKey(): Promise<string | null> {
  if (testOverrides) return testOverrides.anthropicKey ?? null;
  return (await secureStore()).getItemAsync(ANTHROPIC_KEY);
}

export async function setAnthropicKey(value: string): Promise<void> {
  await (await secureStore()).setItemAsync(ANTHROPIC_KEY, value);
}

export async function clearAnthropicKey(): Promise<void> {
  await (await secureStore()).deleteItemAsync(ANTHROPIC_KEY);
}

export async function getGmailTokens(): Promise<GmailTokens | null> {
  if (testOverrides) return testOverrides.gmailTokens ?? null;
  const raw = await (await secureStore()).getItemAsync(GMAIL_TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GmailTokens;
  } catch {
    return null;
  }
}

export async function setGmailTokens(tokens: GmailTokens): Promise<void> {
  await (await secureStore()).setItemAsync(GMAIL_TOKENS_KEY, JSON.stringify(tokens));
}

export async function clearGmailTokens(): Promise<void> {
  await (await secureStore()).deleteItemAsync(GMAIL_TOKENS_KEY);
}

// --- Test hatch -----------------------------------------------------------------
// Lets Node-side tests supply secret fixtures without expo-secure-store. When set,
// the getters short-circuit to these values; pass `null` to restore real behavior.
interface SecretsOverrides {
  anthropicKey?: string | null;
  gmailTokens?: GmailTokens | null;
}
let testOverrides: SecretsOverrides | null = null;

export function __setSecretsForTest(overrides: SecretsOverrides | null): void {
  testOverrides = overrides;
}
