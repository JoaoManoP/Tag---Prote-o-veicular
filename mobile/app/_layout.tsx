import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../src/state/AppContext';
import '../src/services/backgroundLocation';

function Navigation() {
  const { theme } = useApp();
  return <><StatusBar style={theme.dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }} /></>;
}
export default function RootLayout() { return <AppProvider><Navigation /></AppProvider>; }
