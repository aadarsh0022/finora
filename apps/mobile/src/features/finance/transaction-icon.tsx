import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '../../components/ui';
import { useTheme } from '../../theme';

export function TransactionIcon({ type, merchant }: { type: string; merchant: string }) {
  const theme = useTheme();
  const name = merchant.trim().toLowerCase();
  let mark;
  let background: string;
  if (name.includes('google play')) {
    background = '#FFFFFF';
    mark = (
      <Svg width={26} height={28} viewBox="0 0 24 28" accessible={false}>
        <Path d="M2 1 17 14 2 27Z" fill="#4285F4" />
        <Path d="m2 1 17 13 5-4Z" fill="#34A853" />
        <Path d="m2 27 17-13 7 4Z" fill="#EA4335" />
        <Path d="m17 14 7-4v8Z" fill="#FBBC04" />
      </Svg>
    );
  } else if (name.includes('swiggy')) {
    background = '#FFF5E3';
    mark = (
      <AppText
        style={{
          color: '#FC8B20',
          fontSize: 28,
          lineHeight: 34,
          fontFamily: 'DMSansBold',
          transform: [{ rotate: '12deg' }],
        }}
      >
        S
      </AppText>
    );
  } else if (name.includes('zomato')) {
    background = '#EA2338';
    mark = (
      <AppText style={{ color: '#FFFFFF', fontSize: 8, fontFamily: 'DMSansBold' }}>zomato</AppText>
    );
  } else if (name.includes('amazon')) {
    background = '#FFF7E9';
    mark = (
      <AppText style={{ color: '#171717', fontSize: 29, lineHeight: 34, fontFamily: 'DMSansBold' }}>
        a
      </AppText>
    );
  } else if (name.includes('blinkit')) {
    background = '#F7DA38';
    mark = (
      <AppText style={{ color: '#153E24', fontSize: 9, fontFamily: 'DMSansBold' }}>blinkit</AppText>
    );
  } else if (name.includes('phonepe')) {
    background = '#6B22A6';
    mark = (
      <AppText style={{ color: '#FFFFFF', fontSize: 23, fontFamily: 'DMSansBold' }}>पे</AppText>
    );
  } else if (type === 'INCOME') {
    background = theme.accentSoft;
    mark = (
      <Svg width={24} height={28} viewBox="0 0 24 28" accessible={false}>
        <Path d="m8 2 8 0-2 5H10ZM7 9c-8 13-5 17 5 17s13-4 5-17Z" fill={theme.accent} />
        <Path
          d="M14 12h-3c-3 0-3 4 0 4h2c3 0 3 4 0 4h-3m2-10v12"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.4}
        />
      </Svg>
    );
  } else {
    background = type === 'TRANSFER' ? theme.border : theme.dangerSoft;
    mark = (
      <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
        {type === 'TRANSFER' ? (
          <Path
            d="m6 18 12-12M7 6h11v11"
            stroke={theme.muted}
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Path
            d="m7 17 10-10M7 7h10v10"
            stroke={theme.danger}
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    );
  }
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {mark}
    </View>
  );
}
