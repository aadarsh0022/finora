import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AssistantTransactionDraft } from '@finora/contracts';
import { formatMoney, parseMoney } from '@finora/finance-core';
import { AppText, Feedback } from '../../components/ui';
import { useTheme } from '../../theme';
import { accountsSchema, categoriesSchema, useRead } from '../finance/shared';
import { TransactionDraftCard } from './transaction-draft';
import { UserBubble } from './chrome';
import { useApp } from '../../providers/app-provider';

export type DraftReply = (text: string) => void;
export type RegisterDraftReply = (handler: DraftReply) => () => void;
const normalize = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
function missing(draft: AssistantTransactionDraft) {
  if (!draft.amountMinor) return 'amount';
  if (!draft.categoryId && draft.type !== 'TRANSFER') return 'category';
  if (!draft.accountId) return 'account';
  if (!draft.destinationAccountId && draft.type === 'TRANSFER') return 'destination';
  return null;
}

export function TransactionConversation({
  draft: source,
  answerId,
  register,
  onOutcome,
}: {
  draft: AssistantTransactionDraft;
  answerId: string;
  register: RegisterDraftReply;
  onOutcome?: (text: string) => void;
}) {
  const theme = useTheme();
  const { user } = useApp();
  const [draft, setDraft] = useState(source);
  const [cancelled, setCancelled] = useState(false);
  const [history, setHistory] = useState<{ question: string; reply: string }[]>([]);
  const [error, setError] = useState('');
  const field = missing(draft);
  const accounts = useRead('accounts?includeArchived=true', accountsSchema, !!field && !cancelled);
  const categories = useRead(
    'categories?includeArchived=true',
    categoriesSchema,
    !!field && draft.type !== 'TRANSFER' && !cancelled,
  );
  const reply = useRef<DraftReply>(() => undefined);
  const locked = useRef(false);
  const question =
    field === 'amount'
      ? 'How much did you spend or receive?'
      : field === 'category'
        ? `Which category was ${formatMoney(draft.amountMinor!, draft.currency, user?.preferences.locale ?? 'en-IN')} for?`
        : field === 'account'
          ? 'Which account should I use?'
          : 'Which account received the transfer?';
  const options =
    field === 'category'
      ? (categories.data ?? [])
          .filter((item) => !item.archived && item.type === draft.type)
          .map((item) => ({ id: item.id, name: item.name }))
      : (accounts.data ?? [])
          .filter(
            (item) => !item.archived && (field !== 'destination' || item.id !== draft.accountId),
          )
          .map((item) => ({ id: item.id, name: item.name }));
  useEffect(() => {
    locked.current = false;
    if (!field || cancelled) return;
    const handler: DraftReply = (text) => {
      if (locked.current) return;
      if (['cancel', 'cancel transaction', 'never mind'].includes(normalize(text))) {
        setCancelled(true);
        return;
      }
      try {
        const next = { ...draft };
        if (field === 'amount') {
          next.amountMinor = parseMoney(text.trim().replace(/^[₹$€£]\s*/, ''), draft.currency);
          if (BigInt(next.amountMinor) <= 0n)
            throw new Error('Please enter an amount greater than zero.');
        } else {
          const term = normalize(text);
          const choices =
            field === 'category'
              ? (categories.data ?? []).filter((item) => !item.archived && item.type === draft.type)
              : (accounts.data ?? []).filter(
                  (item) =>
                    !item.archived && (field !== 'destination' || item.id !== draft.accountId),
                );
          const exact = choices.filter((item) => normalize(item.name) === term);
          const matches = exact.length
            ? exact
            : term
              ? choices.filter((item) => normalize(item.name).includes(term))
              : [];
          if (matches.length !== 1)
            throw new Error(
              `Please choose one ${field === 'category' ? 'category' : 'account'} below.`,
            );
          const selected = matches[0]!;
          if (field === 'category') {
            next.categoryId = selected.id;
            next.categoryName = selected.name;
          } else if (field === 'account') {
            next.accountId = selected.id;
            next.accountName = selected.name;
          } else {
            next.destinationAccountId = selected.id;
            next.destinationAccountName = selected.name;
          }
        }
        next.missingFields = [];
        if (!next.amountMinor) next.missingFields.push('amount');
        if (!next.accountId) next.missingFields.push('account');
        if (next.type === 'TRANSFER' && !next.destinationAccountId)
          next.missingFields.push('destination');
        if (next.type !== 'TRANSFER' && !next.categoryId) next.missingFields.push('category');
        locked.current = true;
        setError('');
        setHistory((current) => [...current, { question, reply: text }]);
        setDraft(next);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Check this detail.');
      }
    };
    reply.current = handler;
    return register(handler);
  }, [draft, field, cancelled, accounts.data, categories.data, question, register]);
  if (cancelled) return <AppText tone="muted">Okay, nothing was saved.</AppText>;
  return (
    <View style={{ gap: 14 }}>
      {history.map((entry, index) => (
        <View key={index} style={{ gap: 10 }}>
          <AppText>{entry.question}</AppText>
          <UserBubble question={entry.reply} />
        </View>
      ))}
      {field ? (
        <View style={{ gap: 12 }}>
          <AppText accessibilityLiveRegion="polite">{question}</AppText>
          {field === 'amount' ? (
            <AppText tone="muted" style={{ fontSize: 13 }}>
              Enter the amount in {draft.currency} below.
            </AppText>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${option.name}`}
                  onPress={() => reply.current(option.name)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 12,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    minHeight: 44,
                    justifyContent: 'center',
                  }}
                >
                  <AppText style={{ fontSize: 13 }}>{option.name}</AppText>
                </Pressable>
              ))}
            </View>
          )}
          {(accounts.error || categories.error) && (
            <Feedback
              error={accounts.error ?? categories.error}
              retry={() => {
                void accounts.refetch();
                if (draft.type !== 'TRANSFER') void categories.refetch();
              }}
            />
          )}
          {!!error && (
            <AppText tone="danger" accessibilityRole="alert">
              {error}
            </AppText>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel transaction draft"
            onPress={() => {
              setCancelled(true);
              onOutcome?.('Transaction cancelled.');
            }}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <AppText tone="muted" style={{ fontSize: 12 }}>
              Cancel transaction
            </AppText>
          </Pressable>
        </View>
      ) : (
        <TransactionDraftCard draft={draft} answerId={answerId} onOutcome={onOutcome} />
      )}
    </View>
  );
}
