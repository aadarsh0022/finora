import { useEffect, useState, type ReactNode } from 'react';
import { Chevron } from './chevron';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calendarDate } from '@finora/finance-core';
import { calendarDaySchema, monthSchema } from '@finora/contracts';
import { AppButton, AppText, Field } from './ui';
import { useTheme } from '../theme';
import { useApp } from '../providers/app-provider';

export function FlowSheet({
  title,
  visible,
  onClose,
  children,
  footer,
  busy = false,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const theme = useTheme();
  useEffect(() => {
    if (visible || busy) Keyboard.dismiss();
  }, [visible, busy]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}
      >
        <Pressable accessible={false} disabled={busy} style={{ flex: 1 }} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '92%',
            backgroundColor: theme.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 8,
              gap: 12,
            }}
          >
            <AppText
              accessibilityRole="header"
              style={{ flex: 1, fontSize: 23, lineHeight: 30, fontFamily: 'DMSansBold' }}
            >
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onClose}
              style={{
                minHeight: 48,
                minWidth: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText style={{ fontSize: 28 }}>×</AppText>
            </Pressable>
          </View>
          <ScrollView
            pointerEvents={busy ? 'none' : 'auto'}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
          >
            {children}
          </ScrollView>
          <SafeAreaView
            edges={['bottom']}
            style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}
          >
            {footer}
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  placeholder = 'Choose one',
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly (SelectOption & { value: T })[];
  onChange: (value: T) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options.filter((option) =>
    `${option.label} ${option.description ?? ''}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <View style={{ gap: 7 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setSearch('');
          setOpen(true);
        }}
        style={{
          minHeight: 54,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderWidth: 1,
          borderColor: error ? theme.danger : theme.border,
          backgroundColor: theme.surface,
          borderRadius: 12,
          padding: 14,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <AppText tone={selected ? 'text' : 'muted'} style={{ flex: 1 }}>
          {selected?.label ?? placeholder}
        </AppText>
        <Chevron direction="down" />
      </Pressable>
      {error ? (
        <AppText tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <FlowSheet
        title={`Choose ${label.toLowerCase()}`}
        visible={open}
        onClose={() => setOpen(false)}
      >
        {options.length > 6 && (
          <Field
            label={`Search ${label.toLowerCase()}`}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        )}
        {!visibleOptions.length && <AppText tone="muted">No matching options.</AppText>}
        {visibleOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: option.value === value }}
            onPress={() => {
              onChange(option.value);
              setOpen(false);
            }}
            style={{
              padding: 14,
              minHeight: 54,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
              borderRadius: 12,
              backgroundColor: option.value === value ? theme.accentSoft : theme.surface,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText style={{ fontFamily: option.value === value ? 'DMSansBold' : 'DMSans' }}>
                {option.label}
              </AppText>
              {option.description ? (
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  {option.description}
                </AppText>
              ) : null}
            </View>
            {option.value === value && <AppText tone="accent">✓</AppText>}
          </Pressable>
        ))}
      </FlowSheet>
    </View>
  );
}

export function shiftMonth(month: string, offset: number) {
  if (!monthSchema.safeParse(month).success) throw new Error('Invalid month');
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const next = date.toISOString().slice(0, 7);
  return monthSchema.safeParse(next).success ? next : month;
}
export function MonthPicker({
  value,
  onChange,
  label = 'Month',
  variant = 'stepper',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** 'field' is one input-style row that opens the chooser; 'stepper' adds previous/next arrows. */
  variant?: 'stepper' | 'field';
}) {
  const { user } = useApp();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const locale = user?.preferences.locale ?? 'en-IN';
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T12:00:00Z`));
  return (
    <>
      {variant === 'field' ? (
        <View style={{ gap: 7 }}>
          <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose ${label.toLowerCase()}`}
            accessibilityValue={{ text: title }}
            onPress={() => {
              setYear(Number(value.slice(0, 4)));
              setOpen(true);
            }}
            style={{
              minHeight: 54,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 12,
              backgroundColor: theme.surface,
            }}
          >
            <AppText>{title}</AppText>
            <Chevron direction="down" />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Previous ${label.toLowerCase()}`}
            onPress={() => onChange(shiftMonth(value, -1))}
            style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
          >
            <Chevron direction="left" size={24} color={theme.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose ${label.toLowerCase()}`}
            accessibilityValue={{ text: title }}
            onPress={() => {
              setYear(Number(value.slice(0, 4)));
              setOpen(true);
            }}
            style={{
              flex: 1,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.accentSoft,
              borderRadius: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText style={{ fontFamily: 'DMSansBold' }}>{title}</AppText>
              <Chevron direction="down" size={16} color={theme.accent} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Next ${label.toLowerCase()}`}
            onPress={() => onChange(shiftMonth(value, 1))}
            style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
          >
            <Chevron direction="right" size={24} color={theme.text} />
          </Pressable>
        </View>
      )}
      <FlowSheet
        title={`Choose ${label.toLowerCase()}`}
        visible={open}
        onClose={() => setOpen(false)}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppButton
            title="Previous year"
            variant="secondary"
            disabled={year <= 1000}
            onPress={() => setYear(year - 1)}
          />
          <AppText style={{ fontFamily: 'DMSansBold' }}>{year}</AppText>
          <AppButton
            title="Next year"
            variant="secondary"
            disabled={year >= 9999}
            onPress={() => setYear(year + 1)}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 12 }, (_, index) => {
            const month = `${year}-${String(index + 1).padStart(2, '0')}`;
            const name = new Intl.DateTimeFormat(locale, {
              month: 'short',
              timeZone: 'UTC',
            }).format(new Date(`${month}-01T12:00:00Z`));
            return (
              <Pressable
                key={month}
                accessibilityRole="radio"
                accessibilityLabel={month}
                accessibilityState={{ checked: value === month }}
                onPress={() => {
                  onChange(month);
                  setOpen(false);
                }}
                style={{
                  minHeight: 52,
                  width: '30%',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: value === month ? theme.accentSoft : theme.background,
                  borderRadius: 12,
                }}
              >
                <AppText>{name}</AppText>
              </Pressable>
            );
          })}
        </View>
      </FlowSheet>
    </>
  );
}

export function DateField({
  label,
  value,
  onChange,
  error,
  allowClear = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const { user } = useApp();
  const theme = useTheme();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    (calendarDaySchema.safeParse(value).success ? value : today).slice(0, 7),
  );
  const locale = user?.preferences.locale ?? 'en-IN';
  const firstDay = user?.preferences.firstDayOfWeek ?? 1;
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() - firstDay + 7) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const labelDate = (day: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
  const valid = calendarDaySchema.safeParse(value).success;
  function choose(day: string) {
    onChange(day);
    setOpen(false);
  }
  return (
    <View style={{ gap: 7 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: valid ? labelDate(value) : 'Choose date' }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setMonth((valid ? value : today).slice(0, 7));
          setOpen(true);
        }}
        style={{
          minHeight: 54,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: error ? theme.danger : theme.border,
          borderRadius: 12,
          backgroundColor: theme.surface,
        }}
      >
        <AppText tone={valid ? 'text' : 'muted'}>
          {valid ? `${value === today ? 'Today · ' : ''}${labelDate(value)}` : 'Choose date'}
        </AppText>
        <Chevron direction="down" />
      </Pressable>
      {error ? (
        <AppText tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <FlowSheet
        title={`Choose ${label.toLowerCase()}`}
        visible={open}
        onClose={() => setOpen(false)}
        footer={
          allowClear ? (
            <AppButton title="Clear date" variant="secondary" onPress={() => choose('')} />
          ) : undefined
        }
      >
        <MonthPicker value={month} onChange={setMonth} label="calendar month" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: 7 }, (_, index) => (
            <View
              key={`weekday-${index}`}
              style={{ width: '14.285%', alignItems: 'center', paddingVertical: 8 }}
            >
              <AppText tone="muted" style={{ fontSize: 12 }}>
                {new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(2026, 0, 4 + ((firstDay + index) % 7))),
                )}
              </AppText>
            </View>
          ))}
          {Array.from({ length: offset + last.getUTCDate() }, (_, index) => {
            const number = index - offset + 1;
            const day = `${month}-${String(number).padStart(2, '0')}`;
            return number < 1 ? (
              <View key={`blank-${index}`} style={{ width: '14.285%' }} />
            ) : (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`Select ${day}`}
                accessibilityState={{ selected: day === value }}
                onPress={() => choose(day)}
                style={{
                  width: '14.285%',
                  minHeight: 48,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: day === value ? theme.accent : theme.surface,
                  borderRadius: 12,
                }}
              >
                <AppText
                  style={{
                    color: day === value ? theme.onAccent : theme.text,
                    fontFamily: day === today ? 'DMSansBold' : 'DMSans',
                  }}
                >
                  {number}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppButton title="Today" variant="secondary" onPress={() => choose(today)} />
      </FlowSheet>
    </View>
  );
}
