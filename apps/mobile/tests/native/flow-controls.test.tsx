import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { userSchema } from '@finora/contracts';
import { DateField, MonthPicker, SelectField } from '../../src/components/flow';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.com',
  name: 'Test',
  preferences: { locale: 'en-GB' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
beforeEach(() => {
  jest.mocked(useApp).mockReturnValue({ user } as ReturnType<typeof useApp>);
});
it('searches a long selector and commits only a selected option', async () => {
  const change = jest.fn();
  await render(
    <SelectField
      label="Account"
      value="0"
      options={Array.from({ length: 8 }, (_, index) => ({
        value: String(index),
        label: `Wallet ${index}`,
      }))}
      onChange={change}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Account' }));
  await fireEvent.changeText(screen.getByLabelText('Search account'), '7');
  expect(screen.queryByRole('radio', { name: 'Wallet 2' })).toBeNull();
  await fireEvent.press(screen.getByRole('radio', { name: 'Wallet 7' }));
  expect(change).toHaveBeenCalledWith('7');
  expect(screen.queryByRole('radio', { name: 'Wallet 7' })).toBeNull();
});
it('closing a selector preserves the existing selection', async () => {
  const change = jest.fn();
  await render(
    <SelectField
      label="Category"
      value="a"
      options={[
        { value: 'a', label: 'Food' },
        { value: 'b', label: 'Travel' },
      ]}
      onChange={change}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Category' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Close Choose category' }));
  expect(change).not.toHaveBeenCalled();
});
it('picks a valid leap day and preserves it after closing the calendar', async () => {
  function Form() {
    const [value, setValue] = useState('2024-02-28');
    return <DateField label="Date" value={value} onChange={setValue} />;
  }
  await render(<Form />);
  await fireEvent.press(screen.getByRole('button', { name: 'Date' }));
  expect(screen.queryByRole('button', { name: 'Select 2024-02-30' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Select 2024-02-29' }));
  expect(screen.getByRole('button', { name: 'Date' }).props.accessibilityValue.text).toContain(
    '29',
  );
});
it('moves a month across the year boundary without manual date entry', async () => {
  const change = jest.fn();
  await render(<MonthPicker value="2026-12" onChange={change} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  expect(change).toHaveBeenCalledWith('2027-01');
});
