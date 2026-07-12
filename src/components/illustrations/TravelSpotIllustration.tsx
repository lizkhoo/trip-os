import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** Travel spot illustration built from Views — no native SVG dependency. */
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
      <View className="relative w-40 h-28 items-center justify-end">
        <View
          className="absolute bottom-0 rounded-full bg-accent-ochre/25"
          style={{ width: 120, height: 24 }}
        />
        <View
          className="absolute bottom-5 rounded-t-full bg-accent-slate"
          style={{ width: 72, height: 44 }}
        />
        <View
          className="absolute bottom-10 rounded-full bg-accent-rust"
          style={{ width: 18, height: 18, right: 34 }}
        />
        <View
          className="absolute bottom-12 rounded-full bg-paper-warm border-2 border-paper-dim"
          style={{ width: 28, height: 28, left: 28 }}
        />
        <View
          className="absolute rounded-full bg-accent-forest"
          style={{ width: 10, height: 10, top: 8, right: 52 }}
        />
        <View
          className="absolute rounded-full bg-accent-plum/70"
          style={{ width: 8, height: 8, top: 18, left: 44 }}
        />
      </View>
    </Animated.View>
  );
}
