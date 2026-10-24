import { randomUUID } from 'node:crypto';
import { assistantChatInputSchema, assistantChatResponseSchema } from '@finora/contracts';
import type { z } from 'zod';
import { authenticate, type AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { selectAssistantTool } from './provider';
import { runReadOnlyTool } from './tools';
import { prepareTransaction } from './transaction-draft';

const followUps = {
  date_range:
    'Which dates should I check? Try “this month”, “last month”, or a start and end date.',
  account_selection:
    'I can show your total balance here. For an individual account, open Accounts and choose it there.',
  unsupported:
    'I can read your recorded money and prepare new transaction drafts for review. I cannot change existing records, move money or provide financial advice.',
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
  value: z.infer<typeof assistantChatInputSchema>,
  request: Request,
) {
  const input = assistantChatInputSchema.parse(value);
  const selection = await selectAssistantTool(
    input.question,
    input.previousQuestions,
    context.user.preferences,
    request.signal,
  );
  const answerId = randomUUID();
  if (selection.name === 'ask_follow_up')
    return assistantChatResponseSchema.parse({
      answerId,
      kind: selection.arguments.reason === 'unsupported' ? 'unsupported' : 'clarification',
      message: followUps[selection.arguments.reason],
      result: null,
    });
  // Financial values stay in Finora. There is no second model request containing tool results.
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
  return assistantChatResponseSchema.parse({
    answerId,
    kind: 'answer',
    message: answerMessages[selection.name],
    result,
  });
}
