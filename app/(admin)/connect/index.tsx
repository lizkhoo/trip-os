import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { HeaderBack } from '@/components/HeaderBack';
import { refresh } from 'react-native-app-auth';
import { Button, Card, EmptyState } from '@/components/ui';
import {
  connectGmail,
  describeGmailAuthorizeError,
  getConfiguredGoogleClientId,
  gmailAuthConfig,
  GMAIL_CLIENT_ID_MISSING_MESSAGE,
} from '@/services/gmailAuth';
import {
  clearGmailTokens,
  getGmailTokens,
  setGmailTokens,
  type GmailTokens,
} from '@/services/secrets';
import { runGmailSync } from '@/services/syncGmail';

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
    if (!getConfiguredGoogleClientId()) {
      Alert.alert('Google client id missing', GMAIL_CLIENT_ID_MISSING_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = await connectGmail();
      setTokens(result.tokens);
      if (result.missingRefreshToken) {
        Alert.alert(
          'Connected without refresh token',
          'Google did not return a refresh token, so this connection expires in about an hour. ' +
            'To fix: remove trip-os at myaccount.google.com/permissions, then Disconnect and reconnect here.',
        );
      }
    } catch (e) {
      Alert.alert('Connect failed', describeGmailAuthorizeError(e));
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
    const clientId = getConfiguredGoogleClientId();
    if (!clientId) {
      Alert.alert('Google client id missing', GMAIL_CLIENT_ID_MISSING_MESSAGE);
      return;
    }
    if (!tokens.refreshToken) {
      Alert.alert(
        'No refresh token stored',
        'This connection has no refresh token. Disconnect and reconnect Gmail to get one.',
      );
      return;
    }
    setBusy(true);
    try {
      const r = await refresh(gmailAuthConfig(clientId), { refreshToken: tokens.refreshToken });
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
    <ScrollView
      className="flex-1 bg-paper px-4"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Connect Gmail', headerLeft: () => <HeaderBack /> }} />
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
          <View>
            <EmptyState
              title="Not connected"
              description="Authorize trip-os to read your Gmail confirmation emails."
              action={
                <Button
                  title={busy ? 'Connecting…' : 'Connect Gmail'}
                  onPress={connect}
                  disabled={busy}
                />
              }
            />
            {getConfiguredGoogleClientId() ? null : (
              <Text className="text-xs text-accent-rust text-center mt-2 px-4">
                {GMAIL_CLIENT_ID_MISSING_MESSAGE}
              </Text>
            )}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
