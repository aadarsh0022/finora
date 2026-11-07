import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../../components/ui';
import { useTheme } from '../../theme';
export function HistoryDrawer({
  visible,
  onClose,
  headerAction,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.7, 300);
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(-drawerWidth)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    if (visible) setMounted(true);
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active) return;
        Animated.parallel([
          Animated.timing(slide, {
            toValue: visible ? 0 : -drawerWidth,
            duration: reduced ? 0 : 220,
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(backdrop, {
            toValue: visible ? 1 : 0,
            duration: reduced ? 0 : 180,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]).start(({ finished }) => {
          if (active && finished && !visible) setMounted(false);
        });
      })
      .catch(() => {
        slide.setValue(visible ? 0 : -drawerWidth);
        backdrop.setValue(visible ? 1 : 0);
        if (!visible) setMounted(false);
      });
    return () => {
      active = false;
      slide.stopAnimation();
      backdrop.stopAnimation();
    };
  }, [visible, drawerWidth, slide, backdrop]);
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#000000',
            opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat history"
          onPress={onClose}
          style={{ position: 'absolute', inset: 0 }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: drawerWidth,
            flex: 1,
            backgroundColor: theme.surface,
            transform: [{ translateX: slide }],
          }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <AppText
                accessibilityRole="header"
                style={{ fontSize: 18, fontFamily: 'DMSansBold', flexShrink: 1 }}
                numberOfLines={1}
              >
                Walleto AI chats
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {headerAction}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close sidebar"
                  onPress={onClose}
                  style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <AppText style={{ fontSize: 24 }}>×</AppText>
                </Pressable>
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
