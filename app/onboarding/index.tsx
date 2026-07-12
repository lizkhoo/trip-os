import { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Input } from '@/components/ui';
import { OnboardingIllustration } from '@/components/illustrations/OnboardingIllustration';
import {
  connectGmail,
  describeGmailAuthorizeError,
  getConfiguredGoogleClientId,
  GMAIL_CLIENT_ID_MISSING_MESSAGE,
} from '@/services/gmailAuth';
import { getAnthropicKey, setAnthropicKey, getGmailTokens } from '@/services/secrets';
import { isOnboardingComplete, setOnboardingComplete } from '@/services/onboarding';

type OnboardingStep = 'gmail' | 'anthropic' | 'trip';

const STEPS: OnboardingStep[] = ['gmail', 'anthropic', 'trip'];

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const step = STEPS[stepIndex] ?? 'trip';

  const refreshStatus = useCallback(async () => {
    setGmailConnected(!!(await getGmailTokens()));
    setHasAnthropicKey(!!(await getAnthropicKey()));
  }, []);

  useEffect(() => {
    void (async () => {
      if (await isOnboardingComplete()) {
        router.replace('/');
        return;
      }
      await refreshStatus();
    })();
  }, [refreshStatus, router]);

  const finish = useCallback(async () => {
    await setOnboardingComplete();
    router.replace('/');
  }, [router]);

  const goNext = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) {
      void finish();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [finish, stepIndex]);

  const skip = useCallback(() => {
    goNext();
  }, [goNext]);

  const connectGmailStep = useCallback(async () => {
    if (!getConfiguredGoogleClientId()) {
      Alert.alert('Google client id missing', GMAIL_CLIENT_ID_MISSING_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = await connectGmail();
      setGmailConnected(true);
      if (result.missingRefreshToken) {
        Alert.alert(
          'Connected without refresh token',
          'Google did not return a refresh token, so this connection expires in about an hour. ' +
            'To fix: remove trip-os at myaccount.google.com/permissions, then reconnect.',
        );
      }
    } catch (e) {
      Alert.alert('Connect failed', describeGmailAuthorizeError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const saveAnthropicKey = useCallback(async () => {
    if (!keyInput.trim()) return;
    await setAnthropicKey(keyInput.trim());
    setKeyInput('');
    setHasAnthropicKey(true);
  }, [keyInput]);

  const createTrip = useCallback(async () => {
    await setOnboardingComplete();
    router.replace('/trips/new');
  }, [router]);

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 }}
    >
      <Stack.Screen options={{ title: 'Welcome', headerBackVisible: false }} />

      <View className="flex-row justify-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <View
            key={s}
            className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-accent-rust' : 'bg-paper-dim'}`}
            style={{ width: 40 }}
          />
        ))}
      </View>

      <OnboardingIllustration variant={step} />

      {step === 'gmail' ? (
        <View className="mt-4">
          <Text className="font-serif text-2xl text-ink text-center">Connect Gmail</Text>
          <Text className="text-sm text-ink-muted text-center mt-2">
            Import flight and hotel confirmations from your inbox. OAuth runs in a system browser —
            your password never touches this app.
          </Text>
          <Text className="text-xs text-ink-muted text-center mt-4">
            {gmailConnected ? 'Connected' : 'Not connected yet'}
          </Text>
          <View className="mt-6 gap-2">
            <Button
              title={busy ? 'Connecting…' : gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
              onPress={connectGmailStep}
              disabled={busy}
            />
            <Button title="Skip for now" variant="ghost" onPress={skip} disabled={busy} />
            {gmailConnected ? (
              <Button title="Continue" variant="secondary" onPress={goNext} disabled={busy} />
            ) : null}
          </View>
          {getConfiguredGoogleClientId() ? null : (
            <Text className="text-xs text-accent-rust text-center mt-3">{GMAIL_CLIENT_ID_MISSING_MESSAGE}</Text>
          )}
        </View>
      ) : null}

      {step === 'anthropic' ? (
        <View className="mt-4">
          <Text className="font-serif text-2xl text-ink text-center">Connect Anthropic</Text>
          <Text className="text-sm text-ink-muted text-center mt-2">
            trip-os uses Claude to extract reservations from email text. Your API key is stored in the
            iOS Keychain.
          </Text>
          {hasAnthropicKey ? (
            <View className="mt-6 gap-2">
              <Text className="text-base text-ink text-center">API key stored</Text>
              <Button title="Continue" onPress={goNext} />
              <Button title="Skip for now" variant="ghost" onPress={skip} />
            </View>
          ) : (
            <View className="mt-6 gap-2">
              <Input
                placeholder="sk-ant-..."
                value={keyInput}
                onChangeText={setKeyInput}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button title="Save key" onPress={saveAnthropicKey} disabled={!keyInput.trim()} />
              <Button title="Skip for now" variant="ghost" onPress={skip} />
            </View>
          )}
        </View>
      ) : null}

      {step === 'trip' ? (
        <View className="mt-4">
          <Text className="font-serif text-2xl text-ink text-center">Create your first trip</Text>
          <Text className="text-sm text-ink-muted text-center mt-2">
            Name a destination, pick dates, and start building your itinerary.
          </Text>
          <View className="mt-6 gap-2">
            <Button title="Create a trip" onPress={createTrip} />
            <Button title="Skip for now" variant="ghost" onPress={() => void finish()} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
