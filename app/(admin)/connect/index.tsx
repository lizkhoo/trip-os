import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { authorize, refresh, type AuthorizeResult } from 'react-native-app-auth';
import { Button, Card, EmptyState } from '@/components/ui';
import {
  clearGmailTokens,
  getGmailTokens,
  setGmailTokens,
  type GmailTokens,
} from '@/services/secrets';
import { runGmailSync } from '@/services/syncGmail';

// expo-constants ships transitively with expo; require keeps it out of the
// type-graph since the package isn't a direct dependency.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Constants = require('expo-constants').default as {
  expoConfig?: { extra?: { googleClientId?: string } };
};

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function authConfig() {
  const clientId = Constants.expoConfig?.extra?.googleClientId ?? '';
  return {
    issuer: 'https://accounts.google.com',
    clientId,
    // PKCE-only flow: redirectUrl uses the reversed client id with no scheme suffix.
    // The user pastes the matching reversed client id into Info.plist via the
    // app.config plugin once they create their OAuth credential — see README.
    redirectUrl: `${clientId.split('.').reverse().join('.')}:/oauthredirect`,
    scopes: [GMAIL_SCOPE],
    usePKCE: true,
  };
}

export default function ConnectScreen() {
  const [tokens, setTokens] = useState<GmailTokens | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTokens(await getGmailTokens());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const result: AuthorizeResult = await authorize(authConfig());
      const stored: GmailTokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? '',
        accessTokenExpirationDate: result.accessTokenExpirationDate,
        scopes: result.scopes,
      };
      await setGmailTokens(stored);
      setTokens(stored);
    } catch (e) {
      Alert.alert('Connect failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await clearGmailTokens();
    setTokens(null);
  }, []);

  const refreshNow = useCallback(async () => {
    if (!tokens) return;
    setBusy(true);
    try {
      const r = await refresh(authConfig(), { refreshToken: tokens.refreshToken });
      const updated: GmailTokens = {
        ...tokens,
        accessToken: r.accessToken,
        accessTokenExpirationDate: r.accessTokenExpirationDate,
      };
      await setGmailTokens(updated);
      setTokens(updated);
    } catch (e) {
      Alert.alert('Refresh failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [tokens]);

  const syncNow = useCallback(async () => {
    setBusy(true);
    setLastSyncResult(null);
    try {
      const out = await runGmailSync();
      setLastSyncResult(`${out.candidatesCreated} new · ${out.promoted} auto-promoted`);
    } catch (e) {
      Alert.alert('Sync failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const connected = !!tokens;
  const expires = tokens?.accessTokenExpirationDate
    ? new Date(tokens.accessTokenExpirationDate).toLocaleString()
    : null;

  return (
    <ScrollView className="flex-1 bg-paper px-4">
      <Text className="font-serif text-3xl text-ink mt-4 mb-2">Connect Gmail</Text>
      <Text className="text-sm text-ink-muted mb-4">
        OAuth runs in a system browser — your password never touches this app. Tokens are stored in
        the iOS Keychain.
      </Text>

      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">Status</Text>
        {connected ? (
          <View>
            <Text className="text-base text-ink">Connected</Text>
            {expires ? (
              <Text className="text-xs text-ink-muted mt-1">Token expires {expires}</Text>
            ) : null}
            <View className="mt-4 flex-row gap-2">
              <Button title="Sync now" onPress={syncNow} disabled={busy} />
              <Button
                title="Refresh token"
                variant="secondary"
                onPress={refreshNow}
                disabled={busy}
              />
            </View>
            <View className="mt-2">
              <Button title="Disconnect" variant="ghost" onPress={disconnect} disabled={busy} />
            </View>
            {lastSyncResult ? (
              <Text className="text-xs text-ink-muted mt-3">Last sync: {lastSyncResult}</Text>
            ) : null}
          </View>
        ) : (
          <EmptyState
            title="Not connected"
            description="Authorize trip-os to read your Gmail confirmation emails."
            action={
              <Button title={busy ? 'Connecting…' : 'Connect Gmail'} onPress={connect} disabled={busy} />
            }
          />
        )}
      </Card>
    </ScrollView>
  );
}
