import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FinoraMark } from './brand';
import { useTheme } from '../theme';

export function Startup({ onReady }: { onReady?: () => void }) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    const apply = (reduced: boolean) => {
      animation.stop();
      pulse.setValue(0);
      if (active && !reduced) animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active) apply(reduced);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
      animation.stop();
    };
  }, [pulse]);
  return (
    <View
      accessible
      onLayout={onReady}
      accessibilityRole="progressbar"
      accessibilityLabel="Opening Walleto"
      accessibilityState={{ busy: true }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.background,
        gap: 22,
      }}
    >
      <StatusBar style={theme.onAccent === '#FFFFFF' ? 'dark' : 'light'} />
      <Animated.View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 126,
          height: 126,
          borderRadius: 36,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
        }}
      >
        <FinoraMark size={78} />
      </Animated.View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ color: theme.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.7 }}>
          Walleto AI
        </Text>
        <Text style={{ color: theme.muted, fontSize: 14 }}>Your personal money manager</Text>
      </View>
    </View>
  );
}
