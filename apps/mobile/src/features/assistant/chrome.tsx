import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { AppText } from '../../components/ui';
import { useTheme } from '../../theme';

export function ChatThinking({ label = 'Thinking…' }: { label?: string }) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let current = true;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 600,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (current && !reduced) animation.start();
      })
      .catch(() => undefined);
    return () => {
      current = false;
      animation.stop();
    };
  }, [opacity]);
  return (
    <View
      testID="chat-thinking"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <Animated.View accessible={false} style={{ flexDirection: 'row', gap: 4, opacity }}>
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.text }}
          />
        ))}
      </Animated.View>
      <AppText tone="muted" style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </View>
  );
}

export function UserBubble({ question }: { question: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '88%',
        backgroundColor: theme.accentSoft,
        borderRadius: 22,
        paddingHorizontal: 17,
        paddingVertical: 15,
      }}
    >
      <AppText style={{ lineHeight: 24 }}>{question}</AppText>
    </View>
  );
}
