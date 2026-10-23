import { useColorScheme } from 'react-native';
import { useApp } from '../providers/app-provider';

const light = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#18212B',
  muted: '#626D79',
  accent: '#187A5A',
  accentSoft: '#E5F4EC',
  border: '#E3E7EC',
  danger: '#B73838',
  dangerSoft: '#FCECEC',
  hero: '#FFFFFF',
  onHero: '#18212B',
  onAccent: '#FFFFFF',
};
const dark: typeof light = {
  background: '#10151D',
  surface: '#1A222D',
  text: '#EDF5EF',
  muted: '#A6B9AB',
  accent: '#5BD29C',
  accentSoft: '#203C2D',
  border: '#35404E',
  danger: '#FF9696',
  dangerSoft: '#3C2525',
  hero: '#1A222D',
  onHero: '#F1FBF5',
  onAccent: '#10251A',
};
export function useTheme() {
  const system = useColorScheme();
  const { user } = useApp();
  const preference = user?.preferences.preferredTheme ?? 'light';
  return (preference === 'system' ? system : preference) === 'dark' ? dark : light;
}
