import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
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
      <Tabs.Screen name="trips" options={{ title: 'Viagens', tabBarIcon: tabIcon('routes') }} />
      <Tabs.Screen
        name="tracking"
        options={{ title: 'Rastreio', tabBarIcon: tabIcon('crosshairs-gps') }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarLabelStyle: { fontSize: 10, fontWeight: '900', marginTop: 5 },
          tabBarIcon: ({ color }) => (
            <View
              style={{
                width: 54,
                height: 54,
                marginTop: -24,
                borderRadius: 27,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.primary,
                borderWidth: 4,
                borderColor: theme.colors.backgroundElevated,
                elevation: 10
              }}
            >
              <MaterialCommunityIcons name="navigation-variant" color="#FFFFFF" size={27} />
            </View>
          )
        }}
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
