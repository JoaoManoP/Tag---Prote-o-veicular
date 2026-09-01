import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type TextInputProps,
  type ViewProps
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext';
import { palette, radius, spacing, typography } from '../theme/tokens';
import type { Vehicle } from '../types';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export function Icon({
  name,
  size = 22,
  color
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  const { theme } = useApp();
  return <MaterialCommunityIcons name={name} size={size} color={color || theme.colors.text} />;
}
export function Screen({
  children,
  scroll = true,
  style,
  ...props
}: ViewProps & { scroll?: boolean }) {
  const { theme } = useApp();
  const content = (
    <View {...props} style={[styles.content, { backgroundColor: theme.colors.background }, style]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
export function Header({
  title,
  subtitle,
  action,
  eyebrow,
  back
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  back?: boolean;
}) {
  const { theme } = useApp();
  const pathname = usePathname();
  const tabRoutes = ['/', '/map', '/trips', '/tracking', '/community', '/profile', '/auth'];
  const showBack = back ?? !tabRoutes.includes(pathname);
  return (
    <View style={styles.header}>
      {showBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar para a tela anterior"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.65 : 1
          })}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {!!eyebrow && (
          <Text style={[styles.eyebrow, { color: theme.colors.primaryBright }]}>{eyebrow}</Text>
        )}
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {!!subtitle && (
          <Text style={[styles.caption, { color: theme.colors.muted }]}>{subtitle}</Text>
        )}
      </View>
      {action}
    </View>
  );
}
export function Card({ children, style }: ViewProps) {
  const { theme } = useApp();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
        style
      ]}
    >
      {children}
    </View>
  );
}
export function SectionTitle({
  title,
  action,
  eyebrow
}: {
  title: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  const { theme } = useApp();
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1 }}>
        {!!eyebrow && (
          <Text style={[styles.eyebrow, { color: theme.colors.primaryBright }]}>{eyebrow}</Text>
        )}
        <Text style={[styles.sectionText, { color: theme.colors.text }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  icon,
  compact = false
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  icon?: IconName;
  compact?: boolean;
}) {
  const { theme } = useApp();
  const foreground = secondary ? theme.colors.text : palette.white;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: danger
            ? theme.colors.danger
            : secondary
              ? theme.colors.cardElevated
              : theme.colors.accent,
          borderColor: secondary ? theme.colors.border : 'transparent',
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1
        }
      ]}
    >
      {!!icon && <Icon name={icon} size={19} color={foreground} />}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  active = false,
  color
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  color?: string;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.mapOverlay,
          borderColor: active ? theme.colors.primaryBright : theme.colors.border,
          opacity: pressed ? 0.76 : 1
        }
      ]}
    >
      <Icon name={name} size={22} color={color || theme.colors.text} />
    </Pressable>
  );
}
export function QuickAction({
  icon,
  label,
  onPress,
  color
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.75 : 1
        }
      ]}
    >
      <View
        style={[
          styles.quickIcon,
          { backgroundColor: (color || theme.colors.primaryBright) + '18' }
        ]}
      >
        <Icon name={icon} color={color || theme.colors.primaryBright} size={24} />
      </View>
      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Metric({
  icon,
  label,
  value,
  tone = 'primary'
}: {
  icon: IconName;
  label: string;
  value: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const { theme } = useApp();
  const color =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.primaryBright;
  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border }
      ]}
    >
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.metricLabel, { color: theme.colors.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color: theme.colors.text }]}>
        {value}
      </Text>
    </View>
  );
}
export function Input({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textSoft }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.muted}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.cardElevated,
            borderColor: error ? theme.colors.danger : theme.colors.border
          }
        ]}
        {...props}
      />
      {!!error && <Text style={[styles.caption, { color: theme.colors.danger }]}>{error}</Text>}
    </View>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const { theme } = useApp();
  const positive = /ONLINE|MOVING|PROTEGIDO|AO VIVO|ATIVO|GPS/.test(status);
  const warning = /RECONNECTING|ATENÇÃO|PENDENTE/.test(status);
  const tone = positive
    ? theme.colors.success
    : warning
      ? theme.colors.warning
      : theme.colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: tone + '18', borderColor: tone + '55' }]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={{ color: tone, fontSize: 10, fontWeight: '900' }}>{status}</Text>
    </View>
  );
}
export function VehicleCard({ vehicle, onPress }: { vehicle: Vehicle; onPress?: () => void }) {
  const { theme } = useApp();
  const imageUri =
    vehicle.image?.url && !vehicle.image.url.startsWith('/') ? vehicle.image.url : undefined;
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.vehicleCard}>
        <View style={styles.vehicleTop}>
          <View style={{ flex: 1 }}>
            <StatusBadge status={vehicle.selected ? 'PROTEGIDO' : 'CADASTRADO'} />
            <Text style={[styles.vehicleTitle, { color: theme.colors.text }]}>
              {vehicle.nickname || `${vehicle.brand} ${vehicle.model}`}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              {vehicle.brand} {vehicle.model} {vehicle.year || ''}
            </Text>
          </View>
          <View style={[styles.plate, { borderColor: theme.colors.border }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', letterSpacing: 1.2 }}>
              {vehicle.plate || 'SEM PLACA'}
            </Text>
          </View>
        </View>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.vehicleImage} resizeMode="contain" />
        ) : (
          <View style={[styles.vehicleImage, styles.vehiclePlaceholder]}>
            <View style={[styles.vehicleGlow, { backgroundColor: theme.colors.primary + '45' }]} />
            <Icon
              name={vehicle.type === 'motorcycle' ? 'motorbike' : 'car-side'}
              size={94}
              color={theme.colors.textSoft}
            />
          </View>
        )}
      </Card>
    </Pressable>
  );
}
export function EmptyState({
  title,
  message,
  action,
  icon = 'radar'
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  const { theme } = useApp();
  return (
    <Card style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primary + '18' }]}>
        <Icon name={icon} size={34} color={theme.colors.primaryBright} />
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.colors.muted }]}>{message}</Text>
      {action}
    </Card>
  );
}
export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={theme.colors.accent} />
      <Text style={{ color: theme.colors.text }}>{label}</Text>
    </View>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <EmptyState
      icon="alert-circle-outline"
      title="Não foi possível concluir"
      message={message}
      action={retry ? <Button title="Tentar novamente" onPress={retry} /> : undefined}
    />
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 92,
    gap: spacing.md
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.sm
  },
  eyebrow: { fontSize: 10, lineHeight: 16, fontWeight: '900', letterSpacing: 1.4 },
  title: { fontSize: typography.title, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: typography.subtitle, fontWeight: '900', textAlign: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  sectionText: { fontSize: 16, fontWeight: '900' },
  body: { fontSize: typography.body, lineHeight: 22, textAlign: 'center' },
  caption: { fontSize: typography.caption, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: 9
  },
  buttonCompact: { minHeight: 38, paddingHorizontal: 12 },
  buttonText: { fontWeight: '900', fontSize: 14 },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickAction: {
    flex: 1,
    minWidth: 74,
    height: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  metric: { flex: 1, minWidth: 72, borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 3 },
  metricLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  metricValue: { fontSize: 12, fontWeight: '900' },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '800' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.round,
    borderWidth: 1
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  vehicleCard: { minHeight: 236, overflow: 'hidden' },
  vehicleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, zIndex: 2 },
  vehicleTitle: { fontSize: 20, fontWeight: '900', marginTop: 8 },
  vehicleImage: { width: '100%', height: 130 },
  vehiclePlaceholder: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  vehicleGlow: {
    position: 'absolute',
    bottom: 20,
    width: 190,
    height: 25,
    borderRadius: 100,
    transform: [{ scaleX: 1.2 }]
  },
  plate: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  center: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }
});
