import * as SecureStore from 'expo-secure-store';

const ANTHROPIC_KEY = 'tripos.anthropicApiKey';
const GMAIL_TOKENS_KEY = 'tripos.gmailTokens';

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpirationDate: string;
  scopes: string[];
}

export async function getAnthropicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ANTHROPIC_KEY);
}

export async function setAnthropicKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(ANTHROPIC_KEY, value);
}

export async function clearAnthropicKey(): Promise<void> {
  await SecureStore.deleteItemAsync(ANTHROPIC_KEY);
}

export async function getGmailTokens(): Promise<GmailTokens | null> {
  const raw = await SecureStore.getItemAsync(GMAIL_TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GmailTokens;
  } catch {
    return null;
  }
}

export async function setGmailTokens(tokens: GmailTokens): Promise<void> {
  await SecureStore.setItemAsync(GMAIL_TOKENS_KEY, JSON.stringify(tokens));
}

export async function clearGmailTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(GMAIL_TOKENS_KEY);
}
