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
  type TextInputProps,
  type ViewProps
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext';
import { palette, radius, spacing, typography } from '../theme/tokens';
import type { Vehicle } from '../types';
export function Screen({ children, scroll = true, ...props }: ViewProps & { scroll?: boolean }) {
  const { theme } = useApp();
  const content = (
    <View style={[styles.content, { backgroundColor: theme.colors.background }]} {...props}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
  action
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { theme } = useApp();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {subtitle && (
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
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  danger = false
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: danger
            ? theme.colors.danger
            : secondary
              ? 'transparent'
              : theme.colors.accent,
          borderColor: secondary ? theme.colors.border : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1
        }
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: secondary ? theme.colors.text : danger ? palette.white : palette.navy900 }
        ]}
      >
        {title}
      </Text>
    </Pressable>
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
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.muted}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.card,
            borderColor: error ? theme.colors.danger : theme.colors.border
          }
        ]}
        {...props}
      />
      {error && <Text style={[styles.caption, { color: theme.colors.danger }]}>{error}</Text>}
    </View>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const { theme } = useApp();
  const positive = /ONLINE|MOVING|PROTEGIDO|AO VIVO/.test(status);
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor:
            (positive
              ? theme.colors.success
              : status === 'RECONNECTING'
                ? theme.colors.warning
                : theme.colors.muted) + '20'
        }
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: positive
              ? theme.colors.success
              : status === 'RECONNECTING'
                ? theme.colors.warning
                : theme.colors.muted
          }
        ]}
      />
      <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>{status}</Text>
    </View>
  );
}
export function VehicleCard({ vehicle, onPress }: { vehicle: Vehicle; onPress?: () => void }) {
  const { theme } = useApp();
  return (
    <Pressable onPress={onPress}>
      <Card>
        {vehicle.image?.url ? (
          <Image
            source={{ uri: vehicle.image.url }}
            style={styles.vehicleImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.vehicleImage, styles.placeholder]}>
            <Text style={{ fontSize: 42 }}>🚘</Text>
          </View>
        )}
        <StatusBadge status={vehicle.selected ? 'PROTEGIDO' : 'CADASTRADO'} />
        <Text style={[styles.vehicleTitle, { color: theme.colors.text }]}>
          {vehicle.brand} {vehicle.model}
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          {[vehicle.version, vehicle.year].filter(Boolean).join(' · ') || 'Dados não informados'}
        </Text>
        <Text style={[styles.plate, { color: theme.colors.text }]}>
          {vehicle.plate || 'SEM PLACA'}
        </Text>
        {vehicle.image?.source && (
          <Text style={[styles.credit, { color: theme.colors.muted }]}>
            Imagem ilustrativa · {vehicle.image.source}
            {vehicle.image.license ? ` · ${vehicle.image.license}` : ''}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
export function EmptyState({
  title,
  message,
  action
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  const { theme } = useApp();
  return (
    <Card style={styles.center}>
      <Text style={[styles.subtitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.colors.muted }]}>{message}</Text>
      {action}
    </Card>
  );
}
export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={palette.yellow500} />
      <Text>{label}</Text>
    </View>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <EmptyState
      title="Não foi possível concluir"
      message={message}
      action={retry ? <Button title="Tentar novamente" onPress={retry} /> : undefined}
    />
  );
}
export const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, padding: spacing.md, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.sm
  },
  title: { fontSize: typography.title, fontWeight: '900' },
  subtitle: { fontSize: typography.subtitle, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: typography.body, lineHeight: 22, textAlign: 'center' },
  caption: { fontSize: typography.caption, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#001830',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  buttonText: { fontWeight: '900', fontSize: 15 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 50,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vehicleImage: { width: '100%', height: 150, borderRadius: radius.md },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0F4' },
  vehicleTitle: { fontSize: 20, fontWeight: '900' },
  plate: {
    alignSelf: 'flex-start',
    fontWeight: '900',
    letterSpacing: 1.5,
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#E8EDF1'
  },
  credit: { fontSize: 9 },
  center: { alignItems: 'center', paddingVertical: spacing.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }
});
