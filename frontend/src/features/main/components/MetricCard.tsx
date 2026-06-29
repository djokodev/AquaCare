import React from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string | number;
  label: string;
  index: number;
  animationType?: 'bounce' | 'wave' | 'rotate' | 'pulse';
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  color,
  value,
  label,
  index,
  animationType = 'pulse',
  subtitle,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  React.useEffect(() => {
    opacity.value = withDelay(
      index * 50,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })
    );
    translateY.value = withDelay(
      index * 50,
      withSpring(0, { damping: 15, stiffness: 120 })
    );
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const iconAnimation = useSharedValue(0);

  React.useEffect(() => {
    const createAnimationLoop = () => {
      if (animationType === 'rotate') {
        return withRepeat(
          withTiming(1, { duration: 3000, easing: Easing.linear }),
          -1,
          false
        );
      }

      const duration = animationType === 'wave' ? 2000 : animationType === 'bounce' ? 800 : 1200;
      const easing =
        animationType === 'wave'
          ? Easing.inOut(Easing.sin)
          : animationType === 'bounce'
            ? Easing.inOut(Easing.ease)
            : Easing.inOut(Easing.ease);

      return withRepeat(
        withSequence(
          withTiming(1, { duration, easing }),
          withTiming(0, { duration, easing })
        ),
        -1,
        false
      );
    };

    iconAnimation.value = 0;
    const timeout = setTimeout(() => {
      iconAnimation.value = createAnimationLoop();
    }, index * 100);

    return () => clearTimeout(timeout);
  }, [animationType, index]);

  const iconAnimatedStyle = useAnimatedStyle(() => {
    if (animationType === 'bounce') {
      return { transform: [{ translateY: iconAnimation.value * -8 }] };
    } else if (animationType === 'wave') {
      return {
        transform: [
          { translateX: iconAnimation.value * 5 },
          { translateY: Math.sin(iconAnimation.value * Math.PI * 2) * 3 },
        ],
      };
    } else if (animationType === 'rotate') {
      return { transform: [{ rotate: `${iconAnimation.value * 360}deg` }] };
    } else {
      return { transform: [{ scale: 1 + iconAnimation.value * 0.1 }] };
    }
  });

  return (
    <Animated.View
      style={animatedStyle}
      className="w-[48%] bg-white rounded-2xl p-4 shadow-sm items-center mb-3"
    >
      <Animated.View style={iconAnimatedStyle}>
        <Ionicons name={icon} size={32} color={color} />
      </Animated.View>
      <Text
        className="text-2xl font-bold text-gray-dark mt-2 text-center w-full"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      <Text className="text-sm text-gray-light text-center mt-1">{label}</Text>
      {subtitle ? <Text className="text-xs text-gray-light text-center mt-1">{subtitle}</Text> : null}
    </Animated.View>
  );
};

export default React.memo(MetricCard);
