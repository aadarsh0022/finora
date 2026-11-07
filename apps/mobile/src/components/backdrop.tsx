import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

/** Soft pastel wash behind the top of a screen that fades into the page background. */
export function Backdrop({ height = 460 }: { height?: number }) {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        accessible={false}
      >
        <Defs>
          <LinearGradient id="wash" x1="0" y1="0" x2="1" y2="0.7">
            <Stop offset="0" stopColor={theme.accentSoft} />
            <Stop offset="0.55" stopColor={theme.glow} stopOpacity={theme.isDark ? 0.22 : 0.6} />
            <Stop offset="1" stopColor={theme.accentSoft} />
          </LinearGradient>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.background} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#wash)" />
        <Rect width="100" height="100" fill="url(#fade)" />
      </Svg>
    </View>
  );
}
