import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** Animation is skipped under automated tests and when the person asks for reduced motion. */
const testing = process.env.NODE_ENV === 'test';
let reducedMotion: boolean | undefined;
function useMotionAllowed() {
  const [allowed, setAllowed] = useState(() => !testing && reducedMotion !== true);
  useEffect(() => {
    if (testing || reducedMotion !== undefined) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        reducedMotion = reduced;
        if (active && reduced) setAllowed(false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return allowed;
}

/** Fades and lifts its content into place once when it first appears. */
export function FadeIn({
  children,
  delay = 0,
  distance = 8,
  duration = 260,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const allowed = useMotionAllowed();
  const progress = useRef(new Animated.Value(allowed ? 0 : 1)).current;
  useEffect(() => {
    if (!allowed) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [allowed, delay, duration, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Grows upward from its base, for chart bars. Change `replay` to run it again. */
export function GrowUp({
  children,
  replay,
  delay = 0,
  style,
}: {
  children: ReactNode;
  replay?: string | number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const allowed = useMotionAllowed();
  const progress = useRef(new Animated.Value(allowed ? 0 : 1)).current;
  useEffect(() => {
    if (!allowed) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [allowed, delay, progress, replay]);
  return (
    <Animated.View
      style={[style, { transformOrigin: 'bottom', transform: [{ scaleY: progress }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** Springs to a slightly smaller size while pressed. Wrap a pressable with this. */
export function usePressScale(amount = 0.97) {
  const allowed = useMotionAllowed();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) => {
    if (!allowed) return;
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => to(amount),
    onPressOut: () => to(1),
  };
}
