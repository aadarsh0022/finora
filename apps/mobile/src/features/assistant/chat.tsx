import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  assistantServerCapabilitiesSchema as assistantCapabilitiesSchema,
  assistantChatResponseSchema,
  conversationListSchema,
  conversationSchema,
  assistantServerPolicyVersion as assistantPolicyVersion,
} from '@finora/contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AccessibilityInfo,
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
import { ChatThinking, UserBubble, ChatText, ToolActivity } from './chrome';
import type { assistantProgressSchema } from '@finora/contracts';
import { assistantStreamEventSchema } from '@finora/contracts';
import { ClientError } from '../../api/client';
import { FlowSheet } from '../../components/flow';
import { AssistantResult, answerText } from './result';
import { ChangeConversation } from './change-conversation';
import { TransactionConversation, type DraftReply } from './transaction-conversation';
import { useApp } from '../../providers/app-provider';
import { publicPageUrl } from '../../public-site';
import { useTheme } from '../../theme';
import { FinoraMark } from '../../components/brand';
import { savedChatSchema, chatSnapshot, type SavedChat, type ChatTurn } from './history';
import { HistoryDrawer } from './history-drawer';

type Progress = z.infer<typeof assistantProgressSchema>;
type Turn = ChatTurn;
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
  const [hintIndex, setHintIndex] = useState(0);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const hints = [
    'Log an expense…',
    'Ask about this month…',
    'Find a transaction…',
    'Plan your next goal…',
  ];
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!active || reduced) return;
        timer = setInterval(() => {
          Animated.timing(hintOpacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
            isInteraction: false,
          }).start(({ finished }) => {
            if (!finished || !active) return;
            setHintIndex((value) => (value + 1) % 4);
            Animated.timing(hintOpacity, {
              toValue: 1,
              duration: 240,
              useNativeDriver: true,
              isInteraction: false,
            }).start();
          });
        }, 3600);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      hintOpacity.stopAnimation();
    };
  }, [hintOpacity]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState(() => Crypto.randomUUID());
  const [chatTitle, setChatTitle] = useState('');
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>();
  useEffect(() => {
    if (!historyOpen || offline) return;
    let active = true;
    void api
      .request('assistant/v4/chats', conversationListSchema)
      .then((items) => {
        if (active)
          setHistory((cached) =>
            items.map((item) => ({
              id: item.id,
              title: item.title,
              turns: cached.find((chat) => chat.id === item.id)?.turns ?? [],
            })),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [historyOpen, api, offline]);

  useEffect(() => {
    let active = true;
    if (vault && vault.ownerId === user?.id)
      void vault
        .list('chat:', savedChatSchema)
        .then((rows) => {
          if (active)
            setHistory((current) =>
              [
                ...current,
                ...rows
                  .sort((a, b) => b.updated - a.updated)
                  .map((row) => row.value)
                  .filter((chat) => !current.some((entry) => entry.id === chat.id)),
              ].slice(0, 30),
            );
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [vault, user?.id]);
  useEffect(() => {
    if (!turns.length) return;
    const snapshot = { ...chatSnapshot(chatId, turns), ...(chatTitle ? { title: chatTitle } : {}) };
    setHistory((current) =>
      [snapshot, ...current.filter((chat) => chat.id !== chatId)].slice(0, 30),
    );
    if (vault && vault.ownerId === user?.id)
      void vault
        .write(`chat:${chatId}`, snapshot)
        .then(async () => {
          const rows = await vault.list('chat:', savedChatSchema);
          for (const row of rows.sort((a, b) => b.updated - a.updated).slice(30))
            await vault.remove(row.key);
        })
        .catch(() => undefined);
  }, [turns, chatId, chatTitle, vault, user?.id]);
  function outcome(id: string, text: string) {
    setTurns((current) =>
      current.map((turn) =>
        turn.answer.answerId === id
          ? { ...turn, outcome: [turn.outcome, text].filter(Boolean).join(' ').slice(-1000) }
          : turn,
      ),
    );
  }
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState<unknown>();
  const [report, setReport] = useState<string>();
  const [reason, setReason] = useState('incorrect');
  const [reporting, setReporting] = useState(false);
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
      api.request('assistant/v4/capabilities', assistantCapabilitiesSchema, { signal }),
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
      .request('assistant/v4/consent', z.object({ message: z.string() }), {
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
        await api.request('assistant/v4/consent', z.object({ message: z.string() }), {
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
    setChatId(Crypto.randomUUID());
    setChatTitle('');
    setEditingIndex(undefined);
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
  }
  async function send(question = draft.trim()) {
    if (
      !question ||
      !consent ||
      capabilities.data?.enabled === false ||
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
    setProgress([]);
    setDraft('');
    followLatest.current = true;
    setError(undefined);
    setNotice('');
    try {
      if (vault) void syncPending?.().catch(() => undefined);
      let latestSteps: Progress[] = [];
      const contextTurns = editingIndex === undefined ? turns : turns.slice(0, editingIndex);
      const answer = await api.stream(
        'assistant/v4/chat',
        assistantChatResponseSchema,
        assistantStreamEventSchema,
        (event) => {
          if (flight.current !== controller) return;
          if (event.type === 'error')
            throw new ClientError(event.code, event.message, event.status);
          if (event.type === 'answer') return event.answer;
          latestSteps = [
            ...latestSteps.filter((step) => step.id !== event.progress.id),
            event.progress,
          ];
          setProgress(latestSteps);
        },
        {
          method: 'POST',
          signal: controller.signal,
          body: {
            question,
            chatId,
            messageId: Crypto.randomUUID(),
            editOf:
              editingIndex === undefined ? null : (turns[editingIndex]?.answer.answerId ?? null),
            acceptedPolicyVersion: assistantPolicyVersion,
          },
        },
      );
      if (flight.current !== controller) return;
      setTurns(() => [
        ...contextTurns.slice(-39),
        { question, answer, steps: latestSteps.filter((step) => step.state === 'checked') },
      ]);
      setEditingIndex(undefined);
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat history"
            onPress={() => setHistoryOpen(true)}
            style={{ width: 36, height: 42, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="activity" size={21} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <AppText
                accessibilityRole="header"
                style={{
                  fontSize: 18,
                  lineHeight: 25,
                  fontFamily: 'DMSansBold',
                  letterSpacing: -0.8,
                }}
              >
                Finora AI
              </AppText>
            </View>
            <AppText tone="muted" style={{ fontSize: 14 }}>
              Your money, made clear.
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
          {capabilities.data?.enabled !== false && consentReady && !consent && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
                Understand your money. Review every change.
              </AppText>
              <AppText>
                Ask questions, plan your spending or log an entry. You confirm every change.
              </AppText>
              <AppText tone="muted">
                Chats are saved to your account. OpenAI receives your latest 10 messages and
                relevant financial summaries to reply. Avoid sharing passwords. See our privacy
                policy for data handling.
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
                <View
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 22,
                    paddingVertical: 30,
                  }}
                >
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 20,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FinoraMark size={38} />
                  </View>
                  <View style={{ gap: 8, alignItems: 'center' }}>
                    <AppText
                      style={{
                        fontFamily: 'DMSansBold',
                        fontSize: 26,
                        lineHeight: 34,
                        textAlign: 'center',
                      }}
                    >
                      How can I help with your money?
                    </AppText>
                    <AppText tone="muted" style={{ textAlign: 'center', fontSize: 14 }}>
                      Log, fix or ask in plain words.
                    </AppText>
                  </View>
                  <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {(
                      [
                        ['plus', 'Log an expense', 'Spent 450 on pizza'],
                        ['wallet', 'Check my balance', 'What is my current balance?'],
                        ['activity', 'Fix a mistake', 'Undo my last expense'],
                        ['calendar', 'What’s due', 'What’s due this week?'],
                        ['goal', 'Ask about debts', 'What do I owe?'],
                        ['plan', 'Review a month', 'How did last month go?'],
                      ] as const
                    ).map(([icon, label, question]) => (
                      <Pressable
                        key={question}
                        accessibilityRole="button"
                        accessibilityLabel={question}
                        disabled={offline}
                        onPress={() => {
                          setDraft(question);
                        }}
                        style={({ pressed }) => ({
                          width: '48%',
                          minHeight: 104,
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 16,
                          padding: 13,
                          gap: 8,
                          backgroundColor: theme.surface,
                          opacity: offline || pressed ? 0.5 : 1,
                        })}
                      >
                        <Icon name={icon} size={20} color={theme.accent} />
                        <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                          {label}
                        </AppText>
                        <AppText tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
                          {question}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {turns.map(({ question, answer, steps, restored }, turnIndex) => (
                <View key={answer.answerId} style={{ gap: 12 }}>
                  <Pressable
                    accessibilityHint="Long press to edit your message"
                    onLongPress={() => {
                      if (busy) return;
                      setEditingIndex(turnIndex);
                      setDraft(question);
                      transactionReply.current = null;
                      setAwaitingTransaction(false);
                    }}
                  >
                    <UserBubble question={question} />
                  </Pressable>
                  {steps?.map((step) => (
                    <ToolActivity key={step.id} label={step.label} done />
                  ))}
                  {!answer.draft && !answer.change && !answer.prepared?.length && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Pressable
                        testID={`assistant-reply-${answer.answerId}`}
                        accessibilityHint="Long press to report this answer"
                        onLongPress={() => {
                          setReport(answer.answerId);
                          setReason('incorrect');
                          setReportError(undefined);
                        }}
                        style={{
                          flex: 1,
                          paddingHorizontal: 2,
                          paddingVertical: 8,
                        }}
                      >
                        <ChatText
                          animate={answer.answerId === turns.at(-1)?.answer.answerId && !busy}
                        >
                          {answer.result &&
                          (!answer.conversational ||
                            (answer.result.name === 'get_balance' &&
                              !answer.additionalResults?.length))
                            ? answerText(answer.result, user?.preferences.locale)
                            : answer.message}
                        </ChatText>
                      </Pressable>
                    </View>
                  )}
                  {answer.result && <AssistantResult result={answer.result} />}
                  {(answer.additionalResults ?? []).map((result, index) => (
                    <AssistantResult key={`${answer.answerId}-${index}`} result={result} />
                  ))}
                  {answer.change && !restored && turnIndex === turns.length - 1 && !busy && (
                    <ChangeConversation
                      change={answer.change}
                      register={registerDraftReply}
                      onOutcome={(text) => outcome(answer.answerId, text)}
                    />
                  )}
                  {answer.draft && !restored && turnIndex === turns.length - 1 && !busy && (
                    <TransactionConversation
                      draft={answer.draft}
                      answerId={answer.answerId}
                      register={registerDraftReply}
                      onOutcome={(text) => outcome(answer.answerId, text)}
                    />
                  )}
                  {!restored &&
                    turnIndex === turns.length - 1 &&
                    !busy &&
                    (answer.prepared ?? []).map((entry) => (
                      <View key={entry.id}>
                        {entry.draft && (
                          <TransactionConversation
                            draft={entry.draft}
                            answerId={entry.id}
                            register={registerDraftReply}
                            onOutcome={(text) => outcome(answer.answerId, text)}
                          />
                        )}{' '}
                        {entry.change && (
                          <ChangeConversation
                            change={entry.change}
                            register={registerDraftReply}
                            onOutcome={(text) => outcome(answer.answerId, text)}
                          />
                        )}
                      </View>
                    ))}
                </View>
              ))}
              {!!turns.length &&
                !busy &&
                !awaitingTransaction &&
                turns.at(-1)?.answer.kind === 'answer' && (
                  <View style={{ gap: 8 }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8 }}
                      accessibilityLabel="Suggested questions"
                    >
                      {(
                        [
                          ['calendar', 'And last month?', 'And last month?'],
                          [
                            'activity',
                            'Show transactions',
                            'Show the transactions for that period',
                          ],
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
                              minHeight: 36,
                              maxWidth: 200,
                              backgroundColor: theme.surface,
                              borderRadius: 20,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
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
                  {progress
                    .filter((step) => step.state !== 'thinking')
                    .map((step) => (
                      <ToolActivity
                        key={step.id}
                        label={step.label}
                        done={step.state === 'checked'}
                      />
                    ))}
                  {!progress.some((step) => step.state === 'checking') && <ChatThinking />}
                </View>
              )}
            </>
          )}
          {offline && (
            <AppText tone="muted" accessibilityRole="alert">
              You’re offline. Reconnect to ask a question. Earlier answers are recorded snapshots.
            </AppText>
          )}
          {!!error && (
            <Feedback
              error={error}
              retry={
                draft.trim()
                  ? () => {
                      void send();
                    }
                  : undefined
              }
            />
          )}
          {!!notice && (
            <AppText tone="accent" accessibilityRole="alert">
              {notice}
            </AppText>
          )}
        </ScrollView>
        {consent && capabilities.data?.enabled !== false && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
            {editingIndex !== undefined && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEditingIndex(undefined);
                  setDraft('');
                }}
              >
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  Editing message · Cancel
                </AppText>
              </Pressable>
            )}
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
              {!draft && !awaitingTransaction && (
                <Animated.Text
                  pointerEvents="none"
                  accessible={false}
                  style={{
                    position: 'absolute',
                    left: 16,
                    right: 65,
                    top: 19,
                    opacity: hintOpacity,
                    color: theme.muted,
                    fontFamily: 'DMSans',
                    fontSize: 15,
                  }}
                  numberOfLines={1}
                >
                  {hints[hintIndex]}
                </Animated.Text>
              )}
              <TextInput
                accessibilityLabel="Your question"
                placeholder={awaitingTransaction ? 'Enter the missing detail…' : ''}
                placeholderTextColor={theme.muted}
                value={draft}
                onChangeText={setDraft}
                maxLength={4000}
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
      <HistoryDrawer visible={historyOpen} onClose={() => setHistoryOpen(false)}>
        <AppButton
          title="New chat"
          onPress={() => {
            clear();
            setHistoryOpen(false);
          }}
        />
        {!history.length && <AppText tone="muted">Your conversations will appear here.</AppText>}
        {history.map((chat) => (
          <View
            key={chat.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
              paddingVertical: 10,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open chat ${chat.title}`}
              onPress={() => {
                clear();
                setChatId(chat.id);
                setChatTitle(chat.title);
                setTurns(chat.turns.map((turn) => ({ ...turn, restored: true })));
                if (!offline)
                  void api
                    .request(`assistant/v4/chats/${chat.id}`, conversationSchema)
                    .then((saved) => {
                      setTurns(
                        saved.messages.flatMap((message) =>
                          message.answer
                            ? [
                                {
                                  question: message.question,
                                  answer: message.answer,
                                  restored: true,
                                },
                              ]
                            : [],
                        ),
                      );
                    })
                    .catch(setError);
                setHistoryOpen(false);
              }}
              style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
            >
              <AppText numberOfLines={2} style={{ fontSize: 14 }}>
                {chat.title}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete chat ${chat.title}`}
              onPress={() => {
                void api
                  .request(`assistant/v4/chats/${chat.id}`, z.object({ message: z.string() }), {
                    method: 'DELETE',
                  })
                  .then(() => {
                    setHistory((current) => current.filter((entry) => entry.id !== chat.id));
                    if (chat.id === chatId) clear();
                    if (vault) void vault.remove(`chat:${chat.id}`).catch(() => undefined);
                  })
                  .catch(setError);
              }}
              style={{ padding: 10 }}
            >
              <AppText tone="muted" style={{ fontSize: 12 }}>
                Delete
              </AppText>
            </Pressable>
          </View>
        ))}
      </HistoryDrawer>
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
