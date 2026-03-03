import React from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
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
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  color,
  value,
  label,
  index,
  animationType = 'pulse',
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
    const startAnimation = () => {
      'worklet';
      if (animationType === 'bounce') {
        iconAnimation.value = withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }, startAnimation);
          }
        });
      } else if (animationType === 'wave') {
        iconAnimation.value = withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }, startAnimation);
          }
        });
      } else if (animationType === 'rotate') {
        iconAnimation.value = withTiming(1, { duration: 3000, easing: Easing.linear }, (finished) => {
          if (finished) {
            iconAnimation.value = 0;
            startAnimation();
          }
        });
      } else {
        iconAnimation.value = withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) }, startAnimation);
          }
        });
      }
    };

    const timeout = setTimeout(() => {
      startAnimation();
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
      <Text className="text-2xl font-bold text-gray-dark mt-2">{value}</Text>
      <Text className="text-sm text-gray-light text-center mt-1">{label}</Text>
    </Animated.View>
  );
};

export default React.memo(MetricCard);
