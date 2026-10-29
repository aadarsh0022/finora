import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { AppText } from '../../components/ui';
import { useTheme } from '../../theme';
import { Icon } from '../../components/design';

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
    </View>
  );
}

export function UserBubble({ question }: { question: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '85%',
        backgroundColor: theme.accent,
        borderRadius: 24,
        borderBottomRightRadius: 7,
        paddingHorizontal: 16,
        paddingVertical: 11,
      }}
    >
      <AppText style={{ lineHeight: 22, fontSize: 14, color: theme.background }}>
        {question}
      </AppText>
    </View>
  );
}

export function ChatText({ children, animate = false }: { children: string; animate?: boolean }) {
  const [visible, setVisible] = useState(animate ? '' : children);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!animate) {
      setVisible(children);
      return;
    }
    setVisible('');
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active) return;
        if (reduced) {
          setVisible(children);
          return;
        }
        const words = children.match(/\S+\s*/g) ?? [children];
        let count = 0;
        timer = setInterval(() => {
          if (!active) return;
          count += 1;
          setVisible(words.slice(0, count).join(''));
          if (count >= words.length && timer) clearInterval(timer);
        }, 30);
      })
      .catch(() => {
        if (active) setVisible(children);
      });
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [children, animate]);
  return (
    <AppText
      accessible
      accessibilityLabel={children.replaceAll('**', '')}
      style={{ fontSize: 16, lineHeight: 26 }}
    >
      {visible.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
        <AppText
          key={index}
          style={{
            fontSize: 16,
            lineHeight: 26,
            ...(part.startsWith('**') && part.endsWith('**') ? { fontFamily: 'DMSansBold' } : {}),
          }}
        >
          {part.startsWith('**') && part.endsWith('**') ? part.slice(2, -2) : part}
        </AppText>
      ))}
    </AppText>
  );
}

export function ToolActivity({ label, done }: { label: string; done: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingLeft: 2, minHeight: 25 }}
    >
      {done ? (
        <Icon name="check" size={14} color={theme.muted} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
      )}
      <AppText tone="muted" style={{ fontSize: 11 }}>
        {done ? 'Checked your' : 'Checking your'} {label}
        {done ? '' : '…'}
      </AppText>
    </View>
  );
}
