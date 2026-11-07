import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

const paths = {
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
} as const;

/** Drawn arrow used for dropdowns, disclosures and back/forward steps instead of text glyphs. */
export function Chevron({
  direction = 'down',
  size = 18,
  color,
}: {
  direction?: keyof typeof paths;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[direction]}
        stroke={color ?? theme.muted}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
