import {
  categoryInputSchema,
  categorySchema,
  categoryUpdateSchema,
  type Category,
} from '@finora/contracts';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
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
import { CreateAction, EmptyState, Icon } from '../src/components/design';
import { useTheme } from '../src/theme';
import { categoriesSchema, useRead } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';

export default function Categories() {
  const theme = useTheme();
  const query = useRead('categories?includeArchived=true', categoriesSchema);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [show, setShow] = useState('active');
  const shown = (query.data ?? []).filter(
    (category) => category.archived === (show === 'archived'),
  );
  const groups = [
    ['Expense', shown.filter((category) => category.type === 'EXPENSE')],
    ['Income', shown.filter((category) => category.type === 'INCOME')],
  ] as const;
  return (
    <Screen
      title="Categories"
      subtitle="Give every transaction a useful home."
      includeTopInset={false}
      floatingAction={
        !editing ? (
          <CreateAction label="Add category" onPress={() => setEditing('new')} />
        ) : undefined
      }
    >
      {editing ? (
        <CategoryForm
          key={editing === 'new' ? 'new' : `${editing.id}-${editing.version}`}
          category={editing === 'new' ? undefined : editing}
          done={() => setEditing(null)}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['active', 'Active'],
                ['archived', 'Archived'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: show === value }}
                accessibilityLabel={`Show ${label.toLowerCase()} categories`}
                onPress={() => setShow(value)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 18,
                  backgroundColor: show === value ? theme.text : `${theme.text}0F`,
                }}
              >
                <AppText
                  style={{
                    fontSize: 13,
                    fontFamily: 'DMSansBold',
                    color: show === value ? theme.surface : theme.muted,
                  }}
                >
                  {label}
                </AppText>
              </Pressable>
            ))}
          </View>
          {query.isPending && <Loading variant="categories" />}
          {query.isError && (
            <Feedback
              error={query.error}
              retry={() => {
                void query.refetch();
              }}
            />
          )}
          {groups.map(([title, items]) =>
            items.length ? (
              <View key={title} style={{ gap: 8 }}>
                <AppText tone="muted" style={{ fontSize: 12, letterSpacing: 0.6 }}>
                  {title.toUpperCase()}
                </AppText>
                <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
                  {items.map((category, index) => (
                    <Pressable
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${category.name}`}
                      onPress={() => setEditing(category)}
                      style={{
                        minHeight: 52,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        borderTopWidth: index ? 1 : 0,
                        borderTopColor: theme.border,
                      }}
                    >
                      <AppText style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 15 }}>
                        {category.name}
                      </AppText>
                      <Icon name="chevron" size={16} color={theme.muted} />
                    </Pressable>
                  ))}
                </Card>
              </View>
            ) : null,
          )}
          {query.data && !shown.length && (
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
