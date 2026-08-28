import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { api, ApiError } from '../services/api';
import { makeTheme, type ThemePreference } from '../theme/tokens';
import type { Alert, TrackingSession, Trip, User, Vehicle } from '../types';
type Context = {
  booting: boolean;
  user: User | null;
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  trips: Trip[];
  alerts: Alert[];
  session: TrackingSession | null;
  connection: string;
  themePreference: ThemePreference;
  theme: ReturnType<typeof makeTheme>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: any) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setSelected: (v: Vehicle | null) => void;
  setSession: (s: TrackingSession | null) => void;
  setConnection: (s: string) => void;
  setThemePreference: (v: ThemePreference) => Promise<void>;
};
const AppContext = createContext<Context | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme(),
    [booting, setBooting] = useState(true),
    [user, setUser] = useState<User | null>(null),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [selectedVehicle, setSelected] = useState<Vehicle | null>(null),
    [trips, setTrips] = useState<Trip[]>([]),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [session, setSession] = useState<TrackingSession | null>(null),
    [connection, setConnection] = useState('OFFLINE'),
    [themePreference, setThemeState] = useState<ThemePreference>('dark');
  const theme = useMemo(
    () =>
      makeTheme(themePreference === 'dark' || (themePreference === 'system' && scheme === 'dark')),
    [themePreference, scheme]
  );
  const refresh = async () => {
    const [me, garage, history, notifications] = await Promise.all([
      api.get<{ user: User }>('/api/auth/me'),
      api.get<{ vehicles: Vehicle[] }>('/api/vehicles'),
      api.get<{ trips: Trip[] }>('/api/trips'),
      api.get<{ alerts: Alert[] }>('/api/alerts')
    ]);
    setUser(me.user);
    setVehicles(garage.vehicles);
    setSelected(
      current =>
        garage.vehicles.find(v => v.id === current?.id) ||
        garage.vehicles.find(v => v.selected) ||
        garage.vehicles[0] ||
        null
    );
    setTrips(history.trips);
    setAlerts(notifications.alerts);
  };
  useEffect(() => {
    Promise.all([AsyncStorage.getItem('rastreon:theme'), api.get<{ user: User }>('/api/auth/me')])
      .then(async ([pref]) => {
        if (pref) setThemeState(pref as ThemePreference);
        await refresh();
      })
      .catch(error => {
        if (!(error instanceof ApiError && error.status === 401)) console.warn('bootstrap_failed');
      })
      .finally(() => setBooting(false));
  }, []);
  const login = async (email: string, password: string) => {
    await api.post('/api/auth/login', { email, password });
    await refresh();
  };
  const register = async (input: any) => {
    await api.post('/api/auth/register', input);
    await refresh();
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    setVehicles([]);
    setSession(null);
    router.replace('/auth');
  };
  const setThemePreference = async (value: ThemePreference) => {
    setThemeState(value);
    await AsyncStorage.setItem('rastreon:theme', value);
  };
  return (
    <AppContext.Provider
      value={{
        booting,
        user,
        vehicles,
        selectedVehicle,
        trips,
        alerts,
        session,
        connection,
        themePreference,
        theme,
        login,
        register,
        logout,
        refresh,
        setSelected,
        setSession,
        setConnection,
        setThemePreference
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppProvider ausente');
  return value;
}
