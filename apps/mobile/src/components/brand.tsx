import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';
import { AppText } from './ui';
import { useTheme } from '../theme';

export function FinoraMark({ size = 30 }: { size?: number }) {
  const id = `leaf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [bright, light, deep, pale] = useTheme().brand;
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" accessible={false}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={bright} />
          <Stop offset="1" stopColor={light} />
        </LinearGradient>
      </Defs>
      <Path d="M12 3H34V18C34 27 28 33 19 33H3V18C3 9 7 3 12 3Z" fill={`url(#${id})`} />
      <Path d="M3 19C3 12 8 9 15 9H25V20C25 28 19 33 11 33H3Z" fill={deep} opacity={0.8} />
      <Path d="M15 3H34V12H24C17 12 13 17 13 24V33H3V19C3 10 7 3 15 3Z" fill={pale} opacity={0.3} />
    </Svg>
  );
}
export function FinoraWordmark({ large = false }: { large?: boolean }) {
  return (
    <View
      accessibilityLabel="Walleto"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
    >
      <FinoraMark size={large ? 38 : 28} />
      <AppText
        style={{
          fontFamily: 'DMSansBold',
          fontSize: large ? 29 : 23,
          lineHeight: large ? 38 : 30,
          letterSpacing: -1.1,
        }}
      >
        Walleto
      </AppText>
    </View>
  );
}
export function BalanceArtwork() {
  const id = `wallet${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={102} height={112} viewBox="0 0 110 120" accessible={false}>
      <Defs>
        <LinearGradient id={`${id}back`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#FFE0CC" />
          <Stop offset="1" stopColor="#FF8A4C" />
        </LinearGradient>
        <LinearGradient id={`${id}front`} x1="0" y1="0" x2="0.8" y2="1">
          <Stop stopColor="#F2692A" />
          <Stop offset="1" stopColor="#D9480F" />
        </LinearGradient>
      </Defs>
      <G transform="rotate(10 55 60)">
        <Rect x={19} y={82} width={70} height={18} rx={9} fill="#9A2F05" opacity={0.13} />
        <Rect x={26} y={21} width={62} height={64} rx={14} fill={`url(#${id}back)`} />
        <Rect x={39} y={30} width={39} height={33} rx={6} fill="#F2601F" />
        <Rect x={18} y={50} width={65} height={49} rx={13} fill={`url(#${id}front)`} />
        <Path d="M25 53H70" stroke="#FFCBA6" strokeWidth={2} opacity={0.4} />
        <Circle cx={35} cy={67} r={2.2} fill="#FFE3D0" />
        <Circle cx={42} cy={67} r={2.2} fill="#FFE3D0" />
      </G>
    </Svg>
  );
}
export function HeroGradient() {
  const id = `hero${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 340 140"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0 }}
      accessible={false}
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <Stop stopColor="#D9480F" />
          <Stop offset="0.6" stopColor="#F2692A" />
          <Stop offset="1" stopColor="#FF9E5E" />
        </LinearGradient>
      </Defs>
      <Rect width={340} height={140} rx={16} fill={`url(#${id})`} />
      <Circle cx={285} cy={20} r={110} fill="#FFE3D0" opacity={0.07} />
    </Svg>
  );
}
