import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  assistantChangeArgsSchema,
  assistantChangeSchema,
  assistantConfirmResultSchema,
  type AssistantChange,
} from '@finora/contracts';
import { AppButton, AppText, Card, Feedback, Field } from '../../components/ui';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { ActionBadge, ChatConfirmActions, SavedLine } from './confirmation';
import type { RegisterDraftReply } from './transaction-conversation';
const pastVerbs: [RegExp, string][] = [
  [/^mark emi paid/i, 'Marked paid'],
  [/^mark emi unpaid/i, 'Marked unpaid'],
  [/^(add|create|record|set)/i, 'Added'],
  [/^(update|edit|change|restore|copy)/i, 'Updated'],
  [/^(archive|cancel|pause)/i, 'Archived'],
  [/^(delete|remove|reverse)/i, 'Removed'],
];
/** One plain sentence saying what was saved, built from the reviewed details (max 150 characters). */
function savedSentence(change: { title: string; rows: { label: string; value: string }[] }) {
  const verb = pastVerbs.find(([pattern]) => pattern.test(change.title))?.[1] ?? 'Saved';
  const subject = change.rows.find((row) => /^(name|for|record)$/i.test(row.label))?.value;
  const details = change.rows
    .filter((row) => !/^(name|for|record)$/i.test(row.label))
    .map((row) => `${row.label.toLowerCase()} ${row.value}`)
    .join(', ');
  const text = `${verb}${subject ? ` ${subject}` : ` ${change.title.replace(/^(add|create|record|set|update|edit|change|restore|copy|archive|cancel|pause|delete|remove|reverse)\s+/i, '').toLowerCase()}`}${details ? `: ${details}` : ''}.`;
  return text.length > 150 ? `${text.slice(0, 147).trimEnd()}...` : text;
}

export function ChangeConversation({
  change: initial,
  register,
  onOutcome,
}: {
  change: AssistantChange;
  register: RegisterDraftReply;
  onOutcome?: (text: string) => void;
}) {
  const { api, user, refreshUser } = useApp();
  const client = useQueryClient();
  const theme = useTheme();
  const [change, setChange] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [visible, setVisible] = useState(8);
  const lock = useRef(false);
  const flight = useRef<AbortController | null>(null);
  const question = change.questions[0];
  useEffect(
    () => () => {
      flight.current?.abort();
    },
    [],
  );
  async function answer(value: string) {
    if (!question || lock.current || saved || cancelled) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    const controller = new AbortController();
    flight.current = controller;
    try {
      const input = { ...change.input, values: [...change.input.values] };
      if (question.key === 'record' || question.key === 'parent') input[question.key] = value;
      else {
        input.values = input.values.filter((v) => v.field !== question.key);
        input.values.push(
          assistantChangeArgsSchema.shape.values.element.parse({ field: question.key, value }),
        );
      }
      const next = await api.request('assistant/v3/changes/prepare', assistantChangeSchema, {
        method: 'POST',
        body: input,
        signal: controller.signal,
      });
      if (flight.current === controller) {
        setChange(next);
        setText('');
        setVisible(8);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure);
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        lock.current = false;
        setBusy(false);
      }
    }
  }
  const handler = useRef<(value: string) => void>(() => undefined);
  handler.current = (value) => void answer(value);
  useEffect(() => {
    if (!question || saved || cancelled) return;
    return register((value) => handler.current(value));
  }, [question?.key, change.id, saved, cancelled, register]);
  async function confirm() {
    if (!change.token || question || lock.current || saved || cancelled) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    const controller = new AbortController();
    flight.current = controller;
    try {
      await api.request('assistant/v3/changes/confirm', assistantConfirmResultSchema, {
        method: 'POST',
        body: { token: change.token, confirmed: true },
        operationKey: change.id,
        signal: controller.signal,
      });
      if (flight.current !== controller) return;
      setSaved(true);
      onOutcome?.(savedSentence(change));
      void client.invalidateQueries({ queryKey: [user?.id] }).catch(() => undefined);
      if (change.input.operation === 'update_preferences')
        void refreshUser().catch(() => undefined);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure);
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        lock.current = false;
        setBusy(false);
      }
    }
  }
  if (cancelled) return <AppText tone="muted">Okay, nothing was changed.</AppText>;
  if (saved) return <SavedLine text={savedSentence(change)} />;
  const destructive = change.input.operation.startsWith('delete_');
  return (
    <Card style={{ gap: 8, padding: 12, borderRadius: 16 }}>
      <ActionBadge
        icon={destructive ? 'info' : 'check'}
        tone={destructive ? 'danger' : 'accent'}
        label={question ? 'A quick question' : destructive ? 'Please confirm' : 'Review'}
      />
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 16, lineHeight: 22 }}>
        {change.title}
      </AppText>
      {question ? (
        <>
          <AppText>{question.label}</AppText>
          {question.options.length > 0 ? (
            <View style={{ gap: 6 }}>
              {question.options.slice(0, visible).map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  disabled={busy}
                  onPress={() => void answer(option.value)}
                  style={{
                    padding: 10,
                    minHeight: 44,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                  }}
                >
                  <AppText>{option.label}</AppText>
                </Pressable>
              ))}
              {question.options.length > visible && (
                <AppButton
                  title="Show more"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => setVisible((v) => v + 8)}
                />
              )}
            </View>
          ) : (
            <>
              <Field
                label={question.label}
                value={text}
                onChangeText={setText}
                maxLength={1000}
                editable={!busy}
              />
              <AppButton
                title="Continue"
                loading={busy}
                disabled={!text.trim()}
                onPress={() => void answer(text.trim())}
              />
            </>
          )}
        </>
      ) : (
        <>
          {change.rows.map((row, index) => (
            <View key={`${index}:${row.label}`} style={{ flexDirection: 'row', gap: 10 }}>
              <AppText tone="muted" style={{ flex: 1, fontSize: 13 }}>
                {row.label}
              </AppText>
              <AppText style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>{row.value}</AppText>
            </View>
          ))}
          <AppText tone="muted" style={{ fontSize: 12 }}>
            {change.impact}
          </AppText>
          <ChatConfirmActions
            busy={busy}
            disabled={!change.token}
            destructive={destructive}
            label={destructive ? 'Yes, delete' : 'Confirm'}
            onConfirm={() => void confirm()}
            onCancel={() => {
              setCancelled(true);
              onOutcome?.('Cancelled. Nothing was changed.');
            }}
          />
        </>
      )}
      {!!error && <Feedback error={error} />}
      {question && (
        <AppButton
          title="Cancel"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            setCancelled(true);
            onOutcome?.('Cancelled. Nothing was changed.');
          }}
        />
      )}
    </Card>
  );
}
