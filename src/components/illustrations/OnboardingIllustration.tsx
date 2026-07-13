import { useEffect } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
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

const SOURCES: Record<OnboardingIllustrationVariant, ImageSourcePropType> = {
  gmail: require('../../../assets/illustrations/onboarding-gmail.webp'),
  anthropic: require('../../../assets/illustrations/onboarding-anthropic.webp'),
  trip: require('../../../assets/illustrations/onboarding-trip.webp'),
};

/** Whimsical 2D rainbow spot illustrations (see docs/ILLUSTRATIONS.md). */
export function OnboardingIllustration({ variant }: OnboardingIllustrationProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);

  useEffect(() => {
    opacity.value = 0;
    scale.value = 0.94;
    opacity.value = withDelay(
      60,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
    scale.value = withDelay(
      60,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [opacity, scale, variant]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className="items-center justify-center">
      <Image
        source={SOURCES[variant]}
        accessibilityIgnoresInvertColors
        style={{ width: 200, height: 200 }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}
