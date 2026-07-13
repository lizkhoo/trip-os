import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** Travel empty-state spot — same whimsical rainbow language as onboarding. */
export function TravelSpotIllustration() {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(120, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className="items-center mb-2">
      <Image
        source={require('../../../assets/illustrations/empty-travel-spot.webp')}
        accessibilityIgnoresInvertColors
        style={{ width: 180, height: 180 }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}
