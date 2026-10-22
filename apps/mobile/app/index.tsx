import { Redirect } from 'expo-router';
import { useApp } from '../src/providers/app-provider';
export default function Index() {
  const { user } = useApp();
  return <Redirect href={user ? '/(tabs)' : '/(auth)/register'} />;
}
