import type { AssistantTransactionDraft } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { AppButton, AppText, Card } from '../../components/ui';
import { useApp } from '../../providers/app-provider';
import { useTransactionDrafts } from '../../stores/transaction-drafts';

export function TransactionDraftCard({
  draft,
  answerId,
}: {
  draft: AssistantTransactionDraft;
  answerId: string;
}) {
  const { user } = useApp();
  const submitted = useTransactionDrafts((s) => s.submitted.includes(`${user?.id}:${answerId}`));
  return (
    <Card>
      <AppText tone="muted">
        {draft.type === 'EXPENSE' ? 'Expense' : draft.type === 'INCOME' ? 'Income' : 'Transfer'}{' '}
        draft
      </AppText>
      <AppText
        tone={draft.type === 'EXPENSE' ? 'danger' : draft.type === 'INCOME' ? 'accent' : 'text'}
        style={{ fontFamily: 'DMSansBold', fontSize: 30, lineHeight: 40 }}
      >
        {draft.amountMinor === null
          ? 'Amount needed'
          : formatMoney(draft.amountMinor, draft.currency, user?.preferences.locale ?? 'en-IN')}
      </AppText>
      <AppText>Account: {draft.accountName ?? 'Choose in review'}</AppText>
      {draft.type === 'TRANSFER' ? (
        <AppText>To: {draft.destinationAccountName ?? 'Choose in review'}</AppText>
      ) : (
        <AppText>Category: {draft.categoryName ?? 'Choose in review'}</AppText>
      )}
      <AppText tone="muted">Date: {draft.date}</AppText>
      {!!draft.missingFields.length && (
        <AppText tone="muted">
          Some details are missing or could not be matched. Choose them in the review form.
        </AppText>
      )}
      <AppText tone="muted">
        {submitted
          ? 'Transaction submitted. Check Activity and Sync status for its status.'
          : 'Nothing is saved. Review the amount, accounts, category and date before saving.'}
      </AppText>
      <AppButton
        title={submitted ? 'Transaction submitted' : 'Review transaction'}
        disabled={submitted || !user}
        onPress={() => {
          if (user && useTransactionDrafts.getState().open(user.id, answerId, draft))
            router.push({ pathname: '/transaction', params: { assistantDraft: answerId } });
        }}
      />
    </Card>
  );
}
