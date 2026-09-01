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
      initialRouteName="map"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '700' },
        tabBarStyle: {
          position: 'absolute',
          height: 64,
          paddingBottom: 7,
          paddingTop: 6,
          backgroundColor: theme.colors.backgroundElevated,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          shadowColor: '#080A0D',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -6 },
          elevation: 10
        },
        sceneStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarLabelStyle: { fontSize: 9, fontWeight: '900' },
          tabBarIcon: tabIcon('map-marker-radius-outline')
        }}
      />
      <Tabs.Screen name="trips" options={{ title: 'Viagens', tabBarIcon: tabIcon('routes') }} />
      <Tabs.Screen
        name="tracking"
        options={{ title: 'Rastreio', tabBarIcon: tabIcon('crosshairs-gps') }}
      />
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
