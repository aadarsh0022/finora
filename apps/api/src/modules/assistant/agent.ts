import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { assistantChatInputSchema } from '@finora/contracts';
import { assistantChatResponseSchema, type AssistantToolResult } from '@finora/contracts';
import { authenticate, type AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { selectAssistantTool } from './provider';
import { runReadOnlyTool } from './tools';
import { narrativeFacts, shortenReply, writeNarrative } from './narrative';
import { prepareTransaction } from './transaction-draft';
import { prepareChange } from './changes';
import type { assistantProgressSchema } from '@finora/contracts';

const readLabels = {
  get_balance: 'accounts',
  get_cashflow: 'income and spending',
  get_category_spending: 'spending categories',
  get_budget_status: 'budgets',
  get_debt_summary: 'debts',
  plan_finances: 'plan',
  read_records: 'records',
} as const;

export async function answerAgent(
  context: AuthContext,
  input: z.infer<typeof assistantChatInputSchema>,
  request: Request,
  progress: (value: z.infer<typeof assistantProgressSchema>) => void,
) {
  const answerId = randomUUID();
  const results: AssistantToolResult[] = [];
  const seen = new Set<string>();
  progress({ id: 'thinking', state: 'thinking', label: 'Thinking…' });
  for (let round = 0; round < 6; round++) {
    if (request.signal.aborted) throw new ApiError(499, 'CANCELLED', 'Request cancelled.');
    const current = await authenticate(request);
    if (current.user.settingsVersion !== context.user.settingsVersion)
      throw new ApiError(
        409,
        'ASSISTANT_CONTEXT_CHANGED',
        'Your preferences changed. Please ask again.',
      );
    const facts = results.flatMap((result) =>
      narrativeFacts(result, current.user.preferences.locale),
    );
    const selection = await selectAssistantTool(
      input.question,
      input.previousQuestions,
      current.user.preferences,
      request.signal,
      { userId: current.user.id, authVersion: current.user.authVersion, expanded: true },
      input.previousReplies,
      facts,
    );
    if (selection.name === 'finish_answer') break;
    if (selection.name === 'ask_follow_up')
      return assistantChatResponseSchema.parse({
        answerId,
        kind: 'clarification',
        message:
          shortenReply(selection.arguments.message?.replace(/[—–]/g, ',') ?? '') ||
          'What would you like to log or check?',
        result: null,
      });
    if (
      selection.name === 'prepare_transaction' ||
      selection.name === 'prepare_change' ||
      selection.name === 'prepare_multiple'
    ) {
      const calls = selection.name === 'prepare_multiple' ? selection.arguments.calls : [selection];
      const prepared = [];
      for (let index = 0; index < calls.length; index++) {
        const call = calls[index]!;
        progress({ id: `prepare-${index}`, state: 'checking', label: 'entry details' });
        const fresh = await authenticate(request);
        prepared.push({
          id: randomUUID(),
          draft:
            call.name === 'prepare_transaction'
              ? await prepareTransaction(fresh, call.arguments)
              : null,
          change:
            call.name === 'prepare_change' ? await prepareChange(fresh, call.arguments) : null,
        });
        progress({ id: `prepare-${index}`, state: 'checked', label: 'entry details' });
      }
      await authenticate(request);
      return assistantChatResponseSchema.parse({
        answerId,
        kind: prepared.length === 1 && prepared[0]!.change ? 'change' : 'draft',
        message: prepared.some(
          (entry) => entry.draft?.missingFields.length || entry.change?.questions.length,
        )
          ? 'I need one more detail.'
          : prepared.length > 1
            ? `I found ${prepared.length} entries. Check them below.`
            : 'Check the details below.',
        result: null,
        ...(prepared.length === 1
          ? { draft: prepared[0]!.draft, change: prepared[0]!.change }
          : { prepared }),
      });
    }
    const calls = selection.name === 'read_multiple' ? selection.arguments.calls : [selection];
    // Choose the new reads first, then run them together. Order, the 12-result cap and the
    // per-call authentication refresh are unchanged; only the waiting overlaps.
    const fresh: typeof calls = [];
    for (const call of calls) {
      const key = JSON.stringify(call);
      if (seen.has(key)) continue;
      if (results.length + fresh.length >= 12) break;
      seen.add(key);
      fresh.push(call);
    }
    const first = results.length;
    const finished = await Promise.all(
      fresh.map(async (call, offset) => {
        const id = `read-${first + offset}`;
        const label =
          call.name === 'read_records'
            ? call.arguments.feature.replaceAll('_', ' ')
            : readLabels[call.name];
        progress({ id, state: 'checking', label });
        const current = await authenticate(request);
        const result = await runReadOnlyTool(current, call);
        progress({ id, state: 'checked', label });
        return result;
      }),
    );
    results.push(...finished);
    if (!finished.length) break;
  }
  if (!results.length)
    throw new ApiError(
      503,
      'ASSISTANT_UNAVAILABLE',
      'I couldn’t finish that reply. Please try again.',
    );
  const current = await authenticate(request);
  // The app shows exact local text for a lone balance, so a model-written reply would be unused.
  const loneBalance = results.length === 1 && results[0]!.name === 'get_balance';
  const message = loneBalance
    ? null
    : await writeNarrative(current, input, results[0]!, request.signal, results.slice(1));
  await authenticate(request);
  return assistantChatResponseSchema.parse({
    answerId,
    kind: 'answer',
    conversational: !!message,
    message: message ?? 'Here is what I found in your records.',
    result: results[0],
    additionalResults: results.slice(1, 4),
  });
}
