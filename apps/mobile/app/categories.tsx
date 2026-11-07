import {
  categoryInputSchema,
  categorySchema,
  categoryUpdateSchema,
  type Category,
} from '@finora/contracts';
import { useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import {
  AppButton,
  AppText,
  Card,
  Choice,
  Feedback,
  Field,
  Loading,
  Screen,
} from '../src/components/ui';
import { EmptyState } from '../src/components/design';
import { categoriesSchema, useRead } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';

export default function Categories() {
  const query = useRead('categories?includeArchived=true', categoriesSchema);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [show, setShow] = useState('active');
  return (
    <Screen title="Categories" subtitle="Give every transaction a useful home.">
      {editing ? (
        <CategoryForm
          key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
          category={editing === 'new' ? undefined : editing}
          done={() => setEditing(null)}
        />
      ) : (
        <>
          <AppButton title="Add category" onPress={() => setEditing('new')} />
          <Choice
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          {query.isPending && <Loading variant="categories" />}
          {query.isError && (
            <Feedback
              error={query.error}
              retry={() => {
                void query.refetch();
              }}
            />
          )}
          {query.data
            ?.filter((category) => category.archived === (show === 'archived'))
            .map((category) => (
              <Card key={category.id}>
                <AppText style={{ fontFamily: 'DMSansBold' }}>{category.name}</AppText>
                <AppText tone="muted">
                  {category.type.toLowerCase()}
                  {category.archived ? ' · archived' : ''}
                </AppText>
                <AppButton
                  title={category.archived ? 'Edit or restore' : 'Edit category'}
                  variant="secondary"
                  onPress={() => setEditing(category)}
                />
              </Card>
            ))}
          {query.data &&
            !query.data.some((category) => category.archived === (show === 'archived')) && (
              <EmptyState
                icon="plan"
                title={`No ${show} categories`}
                message={
                  show === 'archived'
                    ? 'Categories you archive will appear here.'
                    : 'Add a category to organise your spending.'
                }
              />
            )}
        </>
      )}
    </Screen>
  );
}
function CategoryForm({ category, done }: { category?: Category; done: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState(category?.type ?? 'EXPENSE');
  const [error, setError] = useState('');
  const dirty = name !== (category?.name ?? '') || type !== (category?.type ?? 'EXPENSE');
  const allowLeave = useUnsavedChanges(dirty);
  const save = useFinanceMutation(
    category ? `categories/${category.id}` : 'categories',
    categorySchema,
    category ? 'PATCH' : 'POST',
  );
  const archive = useFinanceMutation(`categories/${category?.id ?? ''}`, categorySchema, 'DELETE');
  async function submit() {
    setError('');
    try {
      const body = {
        name,
        type,
        icon: category?.icon ?? 'tag',
        color: category?.color ?? '#187A5A',
      };
      await save.mutateAsync(
        category
          ? categoryUpdateSchema.parse({ ...body, archived: false, version: category.version })
          : categoryInputSchema.parse(body),
      );
      allowLeave();
      done();
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : failure instanceof Error
            ? failure.message
            : 'Could not save this category.',
      );
    }
  }
  function cancel() {
    if (dirty)
      Alert.alert('Discard changes?', 'The category has not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: done },
      ]);
    else done();
  }
  return (
    <Card>
      <Field label="Category name" value={name} onChangeText={setName} maxLength={50} />
      <Choice
        label="Used for"
        value={type}
        onChange={setType}
        options={[
          { value: 'EXPENSE', label: 'Expenses' },
          { value: 'INCOME', label: 'Income' },
        ]}
      />
      {(error || save.error || archive.error) && (
        <Feedback error={error ? new Error(error) : (save.error ?? archive.error)} />
      )}
      <AppButton
        title={category?.archived ? 'Save and restore' : 'Save category'}
        loading={save.isPending}
        disabled={archive.isPending}
        onPress={() => {
          void submit();
        }}
      />
      {category && !category.archived && (
        <AppButton
          title="Archive category"
          variant="danger"
          loading={archive.isPending}
          disabled={save.isPending || dirty}
          onPress={() =>
            Alert.alert(
              'Archive category?',
              'Existing transactions keep this category. You can restore it later.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Archive',
                  onPress: () => {
                    void archive
                      .mutateAsync({ version: category.version })
                      .then(() => {
                        allowLeave();
                        done();
                      })
                      .catch(() => undefined);
                  },
                },
              ],
            )
          }
        />
      )}
      <AppButton
        title="Cancel"
        variant="secondary"
        disabled={save.isPending || archive.isPending}
        onPress={cancel}
      />
    </Card>
  );
}
