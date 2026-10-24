import { randomUUID } from 'node:crypto';
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
import { writeNarrative } from './narrative';
import { prepareChange } from './changes';
import { prepareTransaction } from './transaction-draft';

const followUps = {
  date_range:
    'Which dates should I check? Try “this month”, “last month”, or a start and end date.',
  account_selection:
    'I can show your total balance here. For an individual account, open Accounts and choose it there.',
  unsupported:
    'I can help with recorded accounts, transactions, budgets, goals, debts, recurring items and financial planning. Tell me what you want to explore or change. Real bank payments, credentials and account security use their dedicated flows.',
  one_question:
    'Please ask about one thing at a time, such as your balance or this month’s spending.',
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
) {
  const input = z.union([assistantChatInputSchema, legacyAssistantChatInputSchema]).parse(value);
  const expanded = input.acceptedPolicyVersion === assistantPolicyVersion;
  const selection = await selectAssistantTool(
    input.question,
    input.previousQuestions,
    context.user.preferences,
    request.signal,
    { userId: context.user.id, authVersion: context.user.authVersion, expanded },
  );
  const answerId = randomUUID();
  if (selection.name === 'ask_follow_up')
    return assistantChatResponseSchema.parse({
      answerId,
      kind: selection.arguments.reason === 'unsupported' ? 'unsupported' : 'clarification',
      message: followUps[selection.arguments.reason],
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
      message:
        'Here is a draft. Review every field and save it in the transaction form. Nothing has been recorded yet.',
      result: null,
      draft: await prepareTransaction(current, selection.arguments),
    });
  const result = await runReadOnlyTool(current, selection);
  const narrative = expanded
    ? await writeNarrative(
        current,
        { ...input, acceptedPolicyVersion: assistantPolicyVersion },
        result,
        request.signal,
      )
    : null;
  await authenticate(request);
  return assistantChatResponseSchema.parse({
    answerId,
    kind: 'answer',
    conversational: !!narrative,
    message:
      narrative ??
      (selection.name === 'read_records' || selection.name === 'plan_finances'
        ? result.name === selection.name
          ? result.data.summary
          : 'Here are your records.'
        : answerMessages[selection.name]),
    result,
  });
}
