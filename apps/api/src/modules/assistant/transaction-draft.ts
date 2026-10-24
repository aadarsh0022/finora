import { z } from 'zod';
import { assistantTransactionArgsSchema, assistantTransactionDraftSchema } from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import type { AuthContext } from '../auth/service';
import { listAccounts, listCategories } from '../finance/entities';
import { ApiError } from '../../utils/http';

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
function match<T extends { name: string }>(items: T[], name: string | null) {
  if (!name) return undefined;
  const matches = items.filter((item) => normalize(item.name) === normalize(name));
  return matches.length === 1 ? matches[0] : undefined;
}
export const transactionDraftToolDefinition = (() => {
  const parameters = z.toJSONSchema(assistantTransactionArgsSchema);
  delete parameters.$schema;
  return {
    type: 'function' as const,
    name: 'prepare_transaction',
    strict: true as const,
    parameters,
    description:
      'Prepare one expense, income or transfer draft for a separate user-reviewed transaction form. Never saves or moves money. Amount is an exact decimal in major currency units, not minor units. Use null for missing details. Names must come from the user, never invent IDs, accounts or categories.',
  };
})();

export async function prepareTransaction(context: AuthContext, value: unknown) {
  const input = assistantTransactionArgsSchema.parse(value);
  const { baseCurrency: currency, timezone } = context.user.preferences;
  if (input.currency && input.currency !== currency)
    throw new ApiError(
      400,
      'CURRENCY_MISMATCH',
      'Use your base currency for this draft. Currency conversion is not supported.',
    );
  let amountMinor: string | null = null;
  if (input.amount !== null) {
    try {
      amountMinor = parseMoney(input.amount, currency);
      if (BigInt(amountMinor) <= 0n) throw new Error('Invalid amount');
    } catch {
      throw new ApiError(
        400,
        'INVALID_DRAFT_AMOUNT',
        'Enter a positive amount using your currency’s decimal places.',
      );
    }
  }
  const accounts = await listAccounts(context, false);
  const categories = (await listCategories(context, false)).filter((c) => c.type === input.type);
  const account = input.accountName
    ? match(accounts, input.accountName)
    : accounts.length === 1
      ? accounts[0]
      : undefined;
  let destination =
    input.type === 'TRANSFER' ? match(accounts, input.destinationAccountName) : undefined;
  if (destination?.id === account?.id) destination = undefined;
  const category = input.type === 'TRANSFER' ? undefined : match(categories, input.categoryName);
  const missingFields: ('amount' | 'account' | 'destination' | 'category')[] = [];
  if (amountMinor === null) missingFields.push('amount');
  if (!account) missingFields.push('account');
  if (input.type === 'TRANSFER' && !destination) missingFields.push('destination');
  if (input.type !== 'TRANSFER' && !category) missingFields.push('category');
  return assistantTransactionDraftSchema.parse({
    type: input.type,
    amountMinor,
    currency,
    timezone,
    date: input.date ?? calendarDate(new Date(), timezone),
    accountId: account?.id ?? null,
    destinationAccountId: destination?.id ?? null,
    categoryId: category?.id ?? null,
    accountName: account?.name ?? null,
    destinationAccountName: destination?.name ?? null,
    categoryName: category?.name ?? null,
    merchant: input.merchant ?? '',
    note: input.note ?? '',
    missingFields,
    requiresConfirmation: true,
  });
}
