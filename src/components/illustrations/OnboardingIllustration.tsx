import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export type OnboardingIllustrationVariant = 'gmail' | 'anthropic' | 'trip';

interface OnboardingIllustrationProps {
  variant: OnboardingIllustrationVariant;
}

/** Step illustrations sharing the travel-spot visual language. */
export function OnboardingIllustration({ variant }: OnboardingIllustrationProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    opacity.value = withDelay(
      80,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );
    scale.value = withDelay(
      80,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }),
    );
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className="items-center justify-center h-32">
      {variant === 'gmail' ? <GmailArt /> : null}
      {variant === 'anthropic' ? <AnthropicArt /> : null}
      {variant === 'trip' ? <TripArt /> : null}
    </Animated.View>
  );
}

function GmailArt() {
  return (
    <View className="items-center">
      <View
        className="rounded-2xl bg-accent-slate/15 border-2 border-accent-slate/30 items-center justify-center"
        style={{ width: 88, height: 64 }}
      >
        <View className="rounded-full bg-accent-rust" style={{ width: 28, height: 28 }} />
      </View>
      <View
        className="absolute -top-1 rounded-full bg-accent-ochre/40"
        style={{ width: 20, height: 20, right: 48 }}
      />
    </View>
  );
}

function AnthropicArt() {
  return (
    <View className="items-center">
      <View
        className="rounded-full bg-accent-plum/15 border-2 border-accent-plum/30 items-center justify-center"
        style={{ width: 72, height: 72 }}
      >
        <View className="rounded-md bg-accent-plum" style={{ width: 28, height: 8 }} />
        <View className="rounded-md bg-accent-plum/60 mt-2" style={{ width: 20, height: 6 }} />
      </View>
    </View>
  );
}

function TripArt() {
  return (
    <View className="relative w-36 h-24 items-center justify-end">
      <View
        className="absolute bottom-0 rounded-full bg-accent-ochre/25"
        style={{ width: 110, height: 20 }}
      />
      <View
        className="absolute bottom-4 rounded-t-full bg-accent-forest/80"
        style={{ width: 64, height: 36 }}
      />
      <View
        className="absolute bottom-8 rounded-full bg-accent-rust"
        style={{ width: 16, height: 16, right: 30 }}
      />
    </View>
  );
}
