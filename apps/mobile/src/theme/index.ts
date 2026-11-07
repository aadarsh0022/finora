import { useColorScheme } from 'react-native';
import type { AccentColor } from '@finora/contracts';
import { useApp } from '../providers/app-provider';
import { useAppearance } from '../stores/appearance';
import { palettes } from './palettes';

const baseLight = {
  surface: '#FFFFFF',
  text: '#16181F',
  muted: '#6F7680',
  danger: '#D84F5C',
  dangerSoft: '#FCECEC',
  success: '#1E8E5A',
  successSoft: '#E3F5EB',
  onHero: '#18212B',
  onHeroMuted: '#FFFFFFC4',
  heroSoft: '#FFFFFF26',
  shadow: '#16181F',
  isDark: false,
};
const baseDark: typeof baseLight = {
  surface: '#1B1E26',
  text: '#EEF0F4',
  muted: '#A3A9B5',
  danger: '#FF9696',
  dangerSoft: '#3C2525',
  success: '#5BD29C',
  successSoft: '#1D3A2D',
  onHero: '#EEF0F4',
  onHeroMuted: '#FFFFFFC4',
  heroSoft: '#FFFFFF1F',
  shadow: '#000000',
  isDark: true,
};
const darkBackground = '#12141A';
const darkBorder = '#2E333E';

function build(accent: AccentColor, dark: boolean) {
  const palette = palettes[accent];
  const tone = dark ? palette.dark : palette.light;
  return {
    ...(dark ? baseDark : baseLight),
    ...tone,
    background: dark ? darkBackground : palette.background,
    border: dark ? darkBorder : palette.border,
    hero: dark ? baseDark.surface : baseLight.surface,
    brand: palette.brand,
  };
}
export type Theme = ReturnType<typeof build>;
const cache = new Map<string, Theme>();
function themeFor(accent: AccentColor, dark: boolean) {
  const key = `${accent}:${dark}`;
  let theme = cache.get(key);
  if (!theme) {
    theme = build(accent, dark);
    cache.set(key, theme);
  }
  return theme;
}

/** Shared spacing and radius scales so screens stay consistent. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28 } as const;
/** Soft layered elevation; dark mode relies on a hairline border instead. */
export function elevation(theme: Theme, level: 1 | 2 = 1) {
  return theme.isDark
    ? { borderWidth: 1, borderColor: theme.border }
    : {
        boxShadow:
          level === 1
            ? `0px 1px 2px ${theme.shadow}0A, 0px 6px 18px ${theme.shadow}10`
            : `0px 2px 4px ${theme.shadow}10, 0px 12px 28px ${theme.shadow}1C`,
      };
}
/** Translucent card fill so the pastel backdrop shows through; opaque in dark mode. */
export const glass = (theme: Theme) => (theme.isDark ? theme.surface : '#FFFFFFD1');
/** The accent in use: this device's choice while it is unsynced, otherwise the saved account value. */
export function useAccent(): AccentColor {
  const { user } = useApp();
  const local = useAppearance((state) => state.accent);
  return local ?? user?.preferences.accentColor ?? 'orange';
}
export function useTheme() {
  const system = useColorScheme();
  const { user } = useApp();
  const accent = useAccent();
  const preference = user?.preferences.preferredTheme ?? 'light';
  return themeFor(accent, (preference === 'system' ? system : preference) === 'dark');
}
