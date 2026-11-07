import { randomUUID } from 'node:crypto';
import type { assistantProgressSchema } from '@finora/contracts';
import {
  assistantChatInputSchema,
  legacyAssistantChatInputSchema,
  assistantPolicyVersion,
  assistantChatResponseSchema,
} from '@finora/contracts';
import { z } from 'zod';
import { authenticate, type AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { selectAssistantTool } from './provider';
import { runReadOnlyTool } from './tools';
import { shortenReply, writeNarrative } from './narrative';
import { prepareChange } from './changes';
import { prepareTransaction } from './transaction-draft';
import { answerAgent } from './agent';

const followUps = {
  date_range:
    'Which dates should I check? Try “this month”, “last month”, or a start and end date.',
  account_selection:
    'I can show your total balance here. For an individual account, open Accounts and choose it there.',
  unsupported:
    'I can log expenses and income, fix entries, and answer questions about your records. What would you like to log or check?',
  one_question: 'What would you like to check or record?',
};
const answerMessages = {
  get_balance: 'Here is your recorded balance.',
  get_cashflow: 'Here is the recorded income and spending for that period.',
  get_category_spending: 'Here is how your recorded spending breaks down.',
  get_budget_status: 'Here is your monthly budget status.',
  get_debt_summary: 'Here are your outstanding debts and expected receipts, shown separately.',
};
export async function answerQuestion(
  context: AuthContext,
  value: z.infer<typeof assistantChatInputSchema> | z.infer<typeof legacyAssistantChatInputSchema>,
  request: Request,
  progress: (value: z.infer<typeof assistantProgressSchema>) => void = () => undefined,
  agent = false,
) {
  const input = z.union([assistantChatInputSchema, legacyAssistantChatInputSchema]).parse(value);
  const expanded = input.acceptedPolicyVersion === assistantPolicyVersion;
  if (agent && expanded)
    return answerAgent(
      context,
      { ...input, acceptedPolicyVersion: assistantPolicyVersion },
      request,
      progress,
    );
  progress({ id: 'thinking', state: 'thinking', label: 'Thinking…' });
  const selection = await selectAssistantTool(
    input.question,
    input.previousQuestions,
    context.user.preferences,
    request.signal,
    { userId: context.user.id, authVersion: context.user.authVersion, expanded },
    input.previousReplies,
  );
  const answerId = randomUUID();
  if (selection.name === 'finish_answer' || selection.name === 'prepare_multiple')
    throw new ApiError(503, 'ASSISTANT_UNAVAILABLE', 'Please try that again.');
  if (selection.name === 'ask_follow_up')
    return assistantChatResponseSchema.parse({
      answerId,
      kind: selection.arguments.reason === 'unsupported' ? 'unsupported' : 'clarification',
      message:
        expanded && selection.arguments.message
          ? shortenReply(selection.arguments.message.replace(/[—–]/g, ','))
          : followUps[selection.arguments.reason],
      result: null,
    });
  // Refresh authentication before every read or prepared change, including cache hits.
  const current = await authenticate(request);
  if (
    current.user.preferences.baseCurrency !== context.user.preferences.baseCurrency ||
    current.user.preferences.timezone !== context.user.preferences.timezone
  )
    throw new ApiError(
      409,
      'ASSISTANT_CONTEXT_CHANGED',
      'Your preferences changed. Please ask again.',
    );
  if (selection.name === 'prepare_change')
    return assistantChatResponseSchema.parse({
      answerId,
      kind: 'change',
      message: 'Let’s review the details.',
      result: null,
      change: await prepareChange(current, selection.arguments),
    });
  if (selection.name === 'prepare_transaction')
    return assistantChatResponseSchema.parse({
      answerId,
      kind: 'draft',
      message: 'Check the details below, then confirm to save.',
      result: null,
      draft: await prepareTransaction(current, selection.arguments),
    });
  const calls = selection.name === 'read_multiple' ? selection.arguments.calls : [selection];
  const labels = {
    get_balance: 'accounts',
    get_cashflow: 'income and spending',
    get_category_spending: 'spending categories',
    get_budget_status: 'budgets',
    get_debt_summary: 'debts',
    plan_finances: 'plan',
    read_records: 'records',
  };
  const results = await Promise.all(
    calls.map(async (call, index) => {
      const label =
        call.name === 'read_records'
          ? call.arguments.feature.replaceAll('_', ' ')
          : labels[call.name];
      progress({ id: `tool-${index}`, state: 'checking', label });
      const result = await runReadOnlyTool(current, call);
      progress({ id: `tool-${index}`, state: 'checked', label });
      return result;
    }),
  );
  const result = results[0]!;
  const loneBalance = results.length === 1 && result.name === 'get_balance';
  const narrative =
    expanded && !loneBalance
      ? await writeNarrative(
          current,
          { ...input, acceptedPolicyVersion: assistantPolicyVersion },
          result,
          request.signal,
          results.slice(1),
        )
      : null;
  await authenticate(request);
  return assistantChatResponseSchema.parse({
    answerId,
    kind: 'answer',
    conversational: !!narrative,
    message:
      narrative ??
      (results.length > 1
        ? 'Here is what I found in your records.'
        : result.name === 'read_records' || result.name === 'plan_finances'
          ? result.data.summary
          : answerMessages[result.name]),
    result,
    additionalResults: results.slice(1),
  });
}
