import { AccessibilityInfo, Animated } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Startup } from '../../src/components/startup';

jest.mock('../../src/components/brand', () => ({ FinoraMark: () => null }));
jest.mock('../../src/theme', () => ({
  useTheme: () => ({
    background: '#F7F9FA',
    text: '#101322',
    muted: '#757D87',
    accentSoft: '#E5F7EE',
    onAccent: '#FFFFFF',
  }),
}));

afterEach(() => jest.restoreAllMocks());

test('shows branded startup and stops animation on unmount', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const start = jest.fn();
  const stop = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
  const view = await render(<Startup />);
  expect(screen.getByText('Walleto AI')).toBeOnTheScreen();
  expect(screen.getByRole('progressbar', { name: 'Opening Walleto' })).toBeOnTheScreen();
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  await view.unmount();
  expect(stop).toHaveBeenCalled();
});

test('keeps startup still when reduced motion is enabled', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const start = jest.fn();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop: jest.fn(), reset: jest.fn() });
  const view = await render(<Startup />);
  await act(async () => undefined);
  expect(start).not.toHaveBeenCalled();
  await view.unmount();
});
