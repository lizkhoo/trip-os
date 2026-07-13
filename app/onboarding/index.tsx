import { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView, Pressable } from 'react-native';
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

const STEP_COPY: Record<
  OnboardingStep,
  { title: string; why: string; body: string }
> = {
  gmail: {
    title: 'Connect Gmail',
    why: 'We need inbox access so flight and hotel confirmations can be imported automatically.',
    body:
      'OAuth runs in a system browser — your password never touches this app. Scope is read-only.',
  },
  anthropic: {
    title: 'Connect Anthropic',
    why: 'Claude turns confirmation emails into structured reservations you can review.',
    body: 'Your API key is stored in the iOS Keychain and never leaves the device except to call Anthropic.',
  },
  trip: {
    title: 'Create your first trip',
    why: 'A trip is the container that holds imported reservations on a day-by-day itinerary.',
    body: 'Name a destination, pick dates, and start building your itinerary.',
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const step = STEPS[stepIndex] ?? 'trip';
  const copy = STEP_COPY[step];
  const canGoBack = stepIndex > 0;

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

  // Re-read connection state whenever the user lands on a step (including going back).
  useEffect(() => {
    void refreshStatus();
  }, [stepIndex, refreshStatus]);

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

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return;
    setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= STEPS.length) return;
    // Only allow jumping to the current step or earlier visited/skipped steps.
    if (index <= stepIndex) {
      setStepIndex(index);
    }
  }, [stepIndex]);

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
      <Stack.Screen
        options={{
          title: 'Welcome',
          headerBackVisible: false,
          headerLeft: canGoBack
            ? () => (
                <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
                  <Text className="text-base text-accent-rust px-1">Back</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <View className="flex-row justify-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const filled = i <= stepIndex;
          const tappable = i < stepIndex;
          return (
            <Pressable
              key={s}
              onPress={() => goToStep(i)}
              disabled={!tappable}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}${tappable ? ', go back' : ''}`}
              hitSlop={8}
            >
              <View
                className={`h-1.5 rounded-full ${filled ? 'bg-accent-rust' : 'bg-paper-dim'}`}
                style={{ width: 40 }}
              />
            </Pressable>
          );
        })}
      </View>

      <OnboardingIllustration variant={step} />

      <View className="mt-4">
        <Text className="font-serif text-2xl text-ink text-center">{copy.title}</Text>
        <Text className="text-sm text-ink text-center mt-3 font-medium">{copy.why}</Text>
        <Text className="text-sm text-ink-muted text-center mt-2">{copy.body}</Text>
      </View>

      {step === 'gmail' ? (
        <View className="mt-4">
          <Text className="text-xs text-ink-muted text-center mt-2">
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
            {canGoBack ? (
              <Button title="Back" variant="ghost" onPress={goBack} disabled={busy} />
            ) : null}
          </View>
          {getConfiguredGoogleClientId() ? null : (
            <Text className="text-xs text-accent-rust text-center mt-3">{GMAIL_CLIENT_ID_MISSING_MESSAGE}</Text>
          )}
        </View>
      ) : null}

      {step === 'anthropic' ? (
        <View className="mt-4">
          {hasAnthropicKey ? (
            <View className="mt-6 gap-2">
              <Text className="text-base text-ink text-center">API key stored</Text>
              <Button title="Continue" onPress={goNext} />
              <Button title="Skip for now" variant="ghost" onPress={skip} />
              {canGoBack ? <Button title="Back" variant="ghost" onPress={goBack} /> : null}
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
              {canGoBack ? <Button title="Back" variant="ghost" onPress={goBack} /> : null}
            </View>
          )}
        </View>
      ) : null}

      {step === 'trip' ? (
        <View className="mt-4">
          <View className="mt-6 gap-2">
            <Button title="Create a trip" onPress={createTrip} />
            <Button title="Skip for now" variant="ghost" onPress={() => void finish()} />
            {canGoBack ? <Button title="Back" variant="ghost" onPress={goBack} /> : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
