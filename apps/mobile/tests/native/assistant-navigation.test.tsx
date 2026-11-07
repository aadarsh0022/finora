import { Text } from 'react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../../app/(tabs)/_layout';
import AssistantLink from '../../app/assistant';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
beforeEach(() => {
  jest.mocked(useApp).mockReturnValue({ user: null } as ReturnType<typeof useApp>);
});
const routes = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': () => <Text>Home page</Text>,
  '(tabs)/transactions': () => <Text>Activity page</Text>,
  '(tabs)/ask': () => <Text>Assistant page</Text>,
  '(tabs)/plan': () => <Text>Plan page</Text>,
  '(tabs)/reports': () => <Text>Insights page</Text>,
  '(tabs)/budgets': () => <Text>Legacy budgets page</Text>,
  assistant: AssistantLink,
};
test('Walleto AI is the middle tab and opens the assistant', async () => {
  const view = await renderRouter(routes, { initialUrl: '/(tabs)' });
  const labels = screen
    .getAllByRole('button')
    .map((tab) => String(tab.props.accessibilityLabel).split(',')[0]);
  expect(labels).toEqual(['Home', 'Activity', 'Walleto AI', 'Plan', 'Insights']);
  await fireEvent.press(screen.getByRole('button', { name: 'Walleto AI, tab, 3 of 5' }));
  expect(await screen.findByText('Assistant page')).toBeVisible();
  expect(view.getPathname()).toBe('/ask');
});
test('old assistant links resolve to the same tab', async () => {
  const view = await renderRouter(routes, { initialUrl: '/assistant' });
  expect(await screen.findByText('Assistant page')).toBeVisible();
  expect(view.getPathname()).toBe('/ask');
});
