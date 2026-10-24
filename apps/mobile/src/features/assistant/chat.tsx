import * as SecureStore from 'expo-secure-store';
import {
  assistantCapabilitiesSchema,
  assistantChatResponseSchema,
  assistantPolicyVersion,
  type AssistantChatResponse,
} from '@finora/contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkState } from 'expo-network';
import { z } from 'zod';
import { AppButton, AppText, Card, Choice, Feedback } from '../../components/ui';
import { Icon } from '../../components/design';
import { ChatThinking, UserBubble } from './chrome';
import { FlowSheet } from '../../components/flow';
import { AssistantResult, answerText } from './result';
import { ChangeConversation } from './change-conversation';
import { AnswerActions } from './answer-actions';
import { TransactionConversation, type DraftReply } from './transaction-conversation';
import { useApp } from '../../providers/app-provider';
import { publicPageUrl } from '../../public-site';
import { useTheme } from '../../theme';
import { FinoraMark } from '../../components/brand';
import { queuedTransactionSchema } from '../../storage/outbox';

type Turn = { question: string; answer: AssistantChatResponse };
export default function AssistantScreen() {
  const { user } = useApp();
  return <AssistantSession key={user?.id ?? 'signed-out'} />;
}

function AssistantSession() {
  const { user, api, vault, syncPending } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [consent, setConsent] = useState(false);
  const [consentReady, setConsentReady] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const consentRecorded = useRef(false);
  useEffect(() => {
    let active = true;
    if (!user) return;
    void SecureStore.getItemAsync(`finora.ai-consent.v1.${user.id}`)
      .then((saved) => {
        if (active) setConsent(saved === assistantPolicyVersion);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setConsentReady(true);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [error, setError] = useState<unknown>();
  const [report, setReport] = useState<string>();
  const [reason, setReason] = useState('incorrect');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const [reportError, setReportError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const flight = useRef<AbortController | null>(null);
  const reportFlight = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const followLatest = useRef(true);
  const transactionReply = useRef<DraftReply | null>(null);
  const [awaitingTransaction, setAwaitingTransaction] = useState(false);
  const registerDraftReply = useCallback((handler: DraftReply) => {
    transactionReply.current = handler;
    setAwaitingTransaction(true);
    return () => {
      if (transactionReply.current === handler) {
        transactionReply.current = null;
        setAwaitingTransaction(false);
      }
    };
  }, []);
  const capabilities = useQuery({
    queryKey: [user?.id, 'assistant-capabilities'],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      api.request('assistant/v3/capabilities', assistantCapabilitiesSchema, { signal }),
  });
  useEffect(() => {
    if (consentReady && capabilities.data?.consentAccepted) setConsent(true);
  }, [consentReady, capabilities.data?.consentAccepted]);
  useEffect(() => {
    if (
      !consentReady ||
      !consent ||
      !capabilities.data?.remembersConsent ||
      capabilities.data.consentAccepted ||
      consentRecorded.current
    )
      return;
    consentRecorded.current = true;
    void api
      .request('assistant/v3/consent', z.object({ message: z.string() }), {
        method: 'POST',
        body: { policyVersion: assistantPolicyVersion },
      })
      .catch(() => {
        consentRecorded.current = false;
      });
  }, [
    api,
    consentReady,
    consent,
    capabilities.data?.remembersConsent,
    capabilities.data?.consentAccepted,
  ]);
  async function acceptConsent() {
    if (!user || accepting) return;
    setAccepting(true);
    setError(undefined);
    try {
      if (capabilities.data?.remembersConsent)
        await api.request('assistant/v3/consent', z.object({ message: z.string() }), {
          method: 'POST',
          body: { policyVersion: assistantPolicyVersion },
        });
      consentRecorded.current = !!capabilities.data?.remembersConsent;
      await SecureStore.setItemAsync(`finora.ai-consent.v1.${user.id}`, assistantPolicyVersion, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }).catch(() => undefined);
      setConsent(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setAccepting(false);
    }
  }
  useEffect(
    () => () => {
      flight.current?.abort();
      reportFlight.current?.abort();
      flight.current = null;
      reportFlight.current = null;
    },
    [],
  );
  function clear() {
    transactionReply.current = null;
    setAwaitingTransaction(false);
    flight.current?.abort();
    flight.current = null;
    setBusy(false);
    setPendingQuestion('');
    setTurns([]);
    setDraft('');
    setError(undefined);
    setNotice('');
    setReported([]);
  }
  async function send(question = draft.trim()) {
    if (
      !question ||
      !consent ||
      !capabilities.data?.enabled ||
      (offline && !transactionReply.current) ||
      flight.current ||
      !user
    )
      return;
    if (transactionReply.current) {
      transactionReply.current(question);
      setDraft('');
      return;
    }
    const controller = new AbortController();
    flight.current = controller;
    setBusy(true);
    setPendingQuestion(question);
    setDraft('');
    followLatest.current = true;
    setError(undefined);
    setNotice('');
    try {
      if (vault) {
        await syncPending?.();
        const recent = await vault.list('pending:', queuedTransactionSchema);
        if (recent.length)
          throw new Error(
            'Your latest entries are saved on this device. Connect again before asking AI about them.',
          );
        if (flight.current !== controller) return;
      }
      const answer = await api.request('assistant/v3/chat', assistantChatResponseSchema, {
        method: 'POST',
        signal: controller.signal,
        body: {
          question,
          previousQuestions: turns.slice(-3).map((t) => t.question),
          previousReplies: turns.slice(-3).map((t) => t.answer.message.slice(0, 1000)),
          acceptedPolicyVersion: assistantPolicyVersion,
        },
      });
      if (flight.current !== controller) return;
      setTurns((current) => [...current.slice(-9), { question, answer }]);
      setDraft('');
    } catch (failure) {
      if (flight.current === controller) {
        setDraft(question);
        setError(failure);
      }
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        setBusy(false);
        setPendingQuestion('');
      }
    }
  }
  function stop() {
    flight.current?.abort();
    flight.current = null;
    setDraft(pendingQuestion);
    setPendingQuestion('');
    setBusy(false);
    setError(undefined);
  }
  async function submitReport() {
    if (!report || reporting || reportFlight.current || offline) return;
    const answerId = report;
    const controller = new AbortController();
    reportFlight.current = controller;
    setReporting(true);
    setReportError(undefined);
    try {
      await api.request('assistant/v3/feedback', z.object({ message: z.string() }), {
        method: 'POST',
        signal: controller.signal,
        body: { answerId, reason },
      });
      if (reportFlight.current !== controller) return;
      setReported((current) => [...current, answerId]);
      setReport(undefined);
      setNotice('Report received. Thank you.');
    } catch (failure) {
      if (reportFlight.current === controller) setReportError(failure);
    } finally {
      if (reportFlight.current === controller) {
        reportFlight.current = null;
        setReporting(false);
      }
    }
  }
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppText
                accessibilityRole="header"
                style={{
                  fontSize: 30,
                  lineHeight: 38,
                  fontFamily: 'DMSansBold',
                  letterSpacing: -0.8,
                }}
              >
                Finora AI
              </AppText>
              <View
                style={{
                  backgroundColor: theme.accentSoft,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <AppText tone="accent" style={{ fontSize: 12 }}>
                  Beta
                </AppText>
              </View>
            </View>
            <AppText tone="muted" style={{ fontSize: 14 }}>
              Your personal money manager
            </AppText>
          </View>
          {(turns.length > 0 || busy) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear chat"
              onPress={clear}
              style={{
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.surface,
                borderRadius: 14,
              }}
            >
              <Icon name="newChat" color={theme.text} />
            </Pressable>
          )}
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 20, flexGrow: 1 }}
          scrollEventThrottle={100}
          onScroll={({ nativeEvent }) => {
            followLatest.current =
              nativeEvent.contentSize.height -
                nativeEvent.contentOffset.y -
                nativeEvent.layoutMeasurement.height <
              100;
          }}
          onContentSizeChange={() => {
            if ((turns.length > 0 || busy) && followLatest.current)
              scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {capabilities.isPending && <ChatThinking label="Connecting…" />}
          {capabilities.error && (
            <Feedback
              error={capabilities.error}
              retry={() => {
                void capabilities.refetch();
              }}
            />
          )}
          {capabilities.data && !capabilities.data.enabled && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold' }}>AI chat is not enabled yet</AppText>
              <AppText tone="muted">
                Your regular tracking features are ready to use. AI chat will be available after its
                server configuration is complete.
              </AppText>
              <AppButton
                title="Check availability"
                variant="secondary"
                disabled={offline}
                onPress={() => {
                  void capabilities.refetch();
                }}
              />
            </Card>
          )}
          {capabilities.data?.enabled && consentReady && !consent && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
                Understand your money. Review every change.
              </AppText>
              <AppText>
                Ask about your money, explore a plan or prepare changes across accounts, budgets,
                goals, debts and recurring items. Every saved change needs your confirmation.
              </AppText>
              <AppText tone="muted">
                To understand your request, OpenAI receives your question, up to three earlier
                questions and replies in this chat, your currency and timezone, and relevant
                financial summaries. Individual merchants, notes, credentials and record IDs are
                excluded from tool summaries.
              </AppText>
              <AppText tone="muted">
                Do not type passwords or bank credentials. Your questions may contain financial
                information if you include it. OpenAI may retain abuse-monitoring data for up to 30
                days; response storage is disabled.
              </AppText>
              <AppText tone="muted">
                This chat stays in app memory and is not saved in Finora AI’s database. Clear chat
                removes it from this screen. Answers use recorded data available at the time shown.
              </AppText>
              <AppButton
                title="Read privacy policy"
                variant="secondary"
                onPress={() => {
                  void Linking.openURL(publicPageUrl('privacy')).catch(() =>
                    setError(new Error('Could not open the privacy policy. Please try again.')),
                  );
                }}
              />
              <AppButton
                title="Enable Finora AI"
                disabled={offline}
                loading={accepting}
                onPress={() => {
                  void acceptConsent();
                }}
              />
            </Card>
          )}
          {consent && (
            <>
              {!turns.length && !busy && (
                <View style={{ flex: 1, justifyContent: 'center', gap: 22, paddingBottom: 28 }}>
                  <View style={{ gap: 8 }}>
                    <AppText style={{ fontFamily: 'DMSansBold', fontSize: 28, lineHeight: 36 }}>
                      A clearer picture of your money.
                    </AppText>
                    <AppText tone="muted">
                      Ask a question. Get an answer from your recorded data.
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {[
                      ['My balance', 'What is my current balance?'],
                      ['This month’s spending', 'How much did I spend this month?'],
                      ['Category breakdown', 'Show my spending by category this month'],
                      ['Budget check', 'How are my budgets this month?'],
                      ['What I owe', 'What do I owe?'],
                    ].map(([label, question]) => (
                      <Pressable
                        key={question}
                        accessibilityRole="button"
                        accessibilityLabel={question}
                        disabled={offline}
                        onPress={() => {
                          void send(question!);
                        }}
                        style={({ pressed }) => ({
                          minHeight: 48,
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 24,
                          paddingHorizontal: 16,
                          justifyContent: 'center',
                          opacity: offline || pressed ? 0.5 : 1,
                        })}
                      >
                        <AppText style={{ fontSize: 14 }}>{label}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {turns.map(({ question, answer }) => (
                <View key={answer.answerId} style={{ gap: 12 }}>
                  <UserBubble question={question} />
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View
                      style={{
                        width: 42,
                        height: 44,
                        backgroundColor: theme.surface,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FinoraMark size={27} />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: theme.surface,
                        borderRadius: 20,
                        padding: 13,
                      }}
                    >
                      <AppText accessibilityLiveRegion="polite" style={{ fontSize: 15 }}>
                        {answer.draft?.missingFields.length
                          ? 'Let’s fill in a detail first.'
                          : answer.result && !answer.conversational
                            ? answerText(answer.result, user?.preferences.locale)
                            : answer.message}
                      </AppText>
                    </View>
                  </View>
                  {answer.result && (
                    <AssistantResult
                      result={answer.result}
                      actions={
                        <AnswerActions
                          answer={answer}
                          reported={reported.includes(answer.answerId)}
                          onReport={() => {
                            setReport(answer.answerId);
                            setReason('incorrect');
                            setReportError(undefined);
                          }}
                        />
                      }
                    />
                  )}
                  {answer.change && (
                    <ChangeConversation change={answer.change} register={registerDraftReply} />
                  )}
                  {answer.draft && (
                    <TransactionConversation
                      draft={answer.draft}
                      answerId={answer.answerId}
                      register={registerDraftReply}
                    />
                  )}
                </View>
              ))}
              {!!turns.length && !busy && !awaitingTransaction && (
                <View style={{ gap: 8 }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                    accessibilityLabel="Suggested questions"
                  >
                    {(
                      [
                        ['activity', 'Show my monthly summary', 'Show my monthly summary'],
                        [
                          'arrowRight',
                          'What are my top expenses?',
                          'Show my spending by category this month',
                        ],
                        [
                          'calendar',
                          'How much did I spend this month?',
                          'How much did I spend this month?',
                        ],
                        ['goal', 'How are my budgets?', 'How are my budgets this month?'],
                        ['wallet', 'What do I owe?', 'What do I owe?'],
                      ] as const
                    )
                      .filter(
                        ([, , question]) =>
                          question.toLocaleLowerCase() !==
                          turns[turns.length - 1]?.question.toLocaleLowerCase(),
                      )
                      .map(([icon, label, question]) => (
                        <Pressable
                          key={question}
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          disabled={offline}
                          onPress={() => {
                            void send(question);
                          }}
                          style={{
                            minHeight: 44,
                            maxWidth: 200,
                            backgroundColor: theme.surface,
                            borderRadius: 15,
                            padding: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 7,
                          }}
                        >
                          <Icon name={icon} color={theme.accent} size={19} />
                          <AppText style={{ fontSize: 12, lineHeight: 17 }}>{label}</AppText>
                        </Pressable>
                      ))}
                  </ScrollView>
                </View>
              )}
              {busy && (
                <View style={{ gap: 18 }}>
                  <UserBubble question={pendingQuestion} />
                  <ChatThinking />
                </View>
              )}
            </>
          )}
          {offline && (
            <AppText tone="muted" accessibilityRole="alert">
              You’re offline. Reconnect to ask a question. Earlier answers are recorded snapshots.
            </AppText>
          )}
          {!!error && <Feedback error={error} />}
          {!!notice && (
            <AppText tone="accent" accessibilityRole="alert">
              {notice}
            </AppText>
          )}
        </ScrollView>
        {consent && capabilities.data?.enabled && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                borderRadius: 28,
                padding: 6,
                paddingLeft: 16,
                gap: 8,
              }}
            >
              <TextInput
                accessibilityLabel="Your question"
                placeholder={
                  awaitingTransaction
                    ? 'Enter the missing detail…'
                    : 'Ask anything about your money…'
                }
                placeholderTextColor={theme.muted}
                value={draft}
                onChangeText={setDraft}
                maxLength={1000}
                editable={!busy}
                multiline
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => {
                  void send();
                }}
                style={{
                  flex: 1,
                  minHeight: 44,
                  maxHeight: 120,
                  paddingTop: 12,
                  paddingBottom: 10,
                  color: theme.text,
                  fontFamily: 'DMSans',
                  fontSize: 16,
                  lineHeight: 22,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Stop response' : 'Send question'}
                accessibilityState={{
                  disabled: !busy && ((offline && !awaitingTransaction) || !draft.trim()),
                }}
                disabled={!busy && ((offline && !awaitingTransaction) || !draft.trim())}
                onPress={() => {
                  if (busy) stop();
                  else void send();
                }}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.accent,
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity:
                    (!busy && ((offline && !awaitingTransaction) || !draft.trim())) || pressed
                      ? 0.35
                      : 1,
                })}
              >
                {busy ? (
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      backgroundColor: theme.background,
                    }}
                  />
                ) : (
                  <Icon name="send" size={23} color={theme.background} />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      <FlowSheet
        title="Report an answer"
        visible={!!report}
        busy={reporting}
        onClose={() => setReport(undefined)}
        footer={
          <AppButton
            title="Send report"
            disabled={offline}
            loading={reporting}
            onPress={() => {
              void submitReport();
            }}
          />
        }
      >
        <AppText>
          What went wrong? Only this reason and a random answer reference are sent. Your
          conversation is not attached.
        </AppText>
        <Choice
          label="Reason"
          value={reason}
          onChange={setReason}
          presentation="list"
          options={[
            { value: 'incorrect', label: 'Incorrect figures or dates' },
            { value: 'unclear', label: 'Unclear or unhelpful answer' },
            { value: 'unsafe', label: 'Unsafe or inappropriate' },
            { value: 'other', label: 'Another issue' },
          ]}
        />
        {!!reportError && <Feedback error={reportError} />}
      </FlowSheet>
    </SafeAreaView>
  );
}
