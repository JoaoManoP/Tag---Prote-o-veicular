import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useApp } from '../../src/state/AppContext';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const tabIcon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} color={color} size={size + 1} />
  );
export default function TabsLayout() {
  const { theme } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primaryBright,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 1 },
        tabBarStyle: {
          position: 'absolute',
          height: 76,
          paddingBottom: 10,
          paddingTop: 8,
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          elevation: 12
        },
        sceneStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: tabIcon('home-variant-outline') }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Mapa', tabBarIcon: tabIcon('map-marker-radius-outline') }}
      />
      <Tabs.Screen name="trips" options={{ title: 'Viagens', tabBarIcon: tabIcon('routes') }} />
      <Tabs.Screen
        name="community"
        options={{ title: 'Comunidade', tabBarIcon: tabIcon('account-group-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: tabIcon('account-circle-outline') }}
      />
    </Tabs>
  );
}
