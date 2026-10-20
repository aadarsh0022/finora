import { useColorScheme } from 'react-native';
import { useApp } from '../providers/app-provider';

const light = {
  background: '#F7F9F8',
  surface: '#FFFFFF',
  text: '#16231E',
  muted: '#5C6D63',
  accent: '#187A5A',
  accentSoft: '#E5F4EC',
  border: '#DFE8E2',
  danger: '#B73838',
  hero: '#173F32',
  onHero: '#F1FBF5',
  onAccent: '#FFFFFF',
};
const dark: typeof light = {
  background: '#0E1512',
  surface: '#17201B',
  text: '#EDF5EF',
  muted: '#A6B9AB',
  accent: '#5BD29C',
  accentSoft: '#203C2D',
  border: '#34483A',
  danger: '#FF9696',
  hero: '#204C39',
  onHero: '#F1FBF5',
  onAccent: '#10251A',
};
export function useTheme() {
  const system = useColorScheme();
  const { user } = useApp();
  const preference = user?.preferences.preferredTheme ?? 'system';
  return (preference === 'system' ? system : preference) === 'dark' ? dark : light;
}
