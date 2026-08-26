import { Redirect } from 'expo-router';
import { LoadingState } from '../src/components/ui';
import { useApp } from '../src/state/AppContext';
export default function Index() {
  const { booting, user } = useApp();
  return booting ? (
    <LoadingState label="Protegendo sua sessão…" />
  ) : (
    <Redirect href={user ? '/(tabs)' : '/auth'} />
  );
}
