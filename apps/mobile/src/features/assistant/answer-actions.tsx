import { useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { Pressable, Share, View } from 'react-native';
import type { AssistantChatResponse } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { AppText } from '../../components/ui';
import { Icon } from '../../components/design';
import { useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';

export function AnswerActions({
  answer,
  reported,
  onReport,
}: {
  answer: AssistantChatResponse;
  reported: boolean;
  onReport: () => void;
}) {
  const theme = useTheme();
  const { user } = useApp();
  const [liked, setLiked] = useState(false);
  const [notice, setNotice] = useState('');
  const result = answer.result;
  const money = (value: string) =>
    result ? formatMoney(value, result.currency, user?.preferences.locale ?? 'en-IN') : value;
  const details = !result
    ? ''
    : result.name === 'get_balance'
      ? `Recorded balance: ${money(result.data.totalBalanceMinor)}\n${result.data.accounts.map((account) => `${account.name}: ${money(account.balanceMinor)}`).join('\n')}`
      : result.name === 'get_cashflow'
        ? `Income: ${money(result.data.incomeMinor)}\nExpenses: ${money(result.data.expensesMinor)}\nNet: ${money(result.data.netMinor)}`
        : result.name === 'get_category_spending'
          ? result.data.categories
              .map((category) => `${category.name}: ${money(category.amountMinor)}`)
              .join('\n')
          : result.name === 'get_debt_summary'
            ? `You owe: ${money(result.data.owedByYouMinor)}\nPersonal loans owed to you: ${money(result.data.personalLoansOwedToYouMinor)}`
            : `Spent: ${money(result.data.total.spentMinor)}`;
  const text = `${answer.message}${details ? `\n${details}\nRecorded on ${result?.retrievedAt}.` : ''}`;
  async function copy() {
    try {
      if (!requireOptionalNativeModule('ExpoClipboard')) {
        setNotice('Copy is available in the latest app build.');
        return;
      }
      const clipboard = await import('expo-clipboard');
      await clipboard.setStringAsync(text, { android: { isSensitive: true } });
      setNotice('Copied');
    } catch {
      setNotice('Could not copy. Install the latest app build and try again.');
    }
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 0 }}>
        {(
          [
            {
              icon: 'thumbsUp',
              label: 'Mark answer helpful',
              action: () => setLiked(!liked),
              selected: liked,
              disabled: false,
            },
            {
              icon: 'thumbsDown',
              label: reported ? 'Answer reported' : 'Report this answer',
              action: onReport,
              selected: reported,
              disabled: reported,
            },
            {
              icon: 'copy',
              label: 'Copy answer',
              action: () => {
                void copy();
              },
              selected: false,
              disabled: false,
            },
            {
              icon: 'share',
              label: 'Share answer',
              action: () => {
                void Share.share({ message: text }).catch(() =>
                  setNotice('Could not open sharing. Please try again.'),
                );
              },
              selected: false,
              disabled: false,
            },
          ] as const
        ).map((action) => (
          <Pressable
            key={action.icon}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ selected: action.selected, disabled: action.disabled }}
            disabled={action.disabled}
            onPress={action.action}
            style={{
              width: 40,
              height: 44,
              borderRadius: 10,
              borderWidth: 0,
              borderColor: theme.border,
              backgroundColor: action.selected ? theme.accentSoft : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={action.icon}
              size={16}
              color={action.selected ? theme.accent : theme.text}
            />
          </Pressable>
        ))}
      </View>
      {!!notice && (
        <AppText tone="muted" accessibilityRole="alert" style={{ fontSize: 11 }}>
          {notice}
        </AppText>
      )}
    </View>
  );
}
