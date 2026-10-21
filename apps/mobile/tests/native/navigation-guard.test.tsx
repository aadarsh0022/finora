import { act, renderHook } from '@testing-library/react-native';
import { usePreventRemove } from 'expo-router';
import { useUnsavedChanges } from '../../src/hooks/finance';

jest.mock('expo-router', () => ({ usePreventRemove: jest.fn() }));
it('clears the enabled guard when a completed save releases navigation', async () => {
  const disable = jest.fn();
  jest.mocked(usePreventRemove).mockReturnValue(disable);
  const { result } = await renderHook(() => useUnsavedChanges(true));
  expect(usePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
  await act(() => {
    result.current();
  });
  expect(disable).toHaveBeenCalledTimes(1);
  expect(usePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
});
