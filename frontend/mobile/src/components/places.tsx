import { router } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../state/AppContext';
import { Card, EmptyState, Icon, type IconName } from './ui';

export type PlacePrice = {
  id: string;
  fuelType: string;
  price: number;
  status: string;
  source?: string;
  confirmations?: number;
  observedAt?: number;
};
export type PlaceRating = { count: number; average: number | null };
export type Place = {
  id: string;
  placeKey: string;
  name: string;
  brand?: string | null;
  address?: string;
  category: string;
  categoryLabel?: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  phone?: string | null;
  openingHours?: string | null;
  website?: string | null;
  registered?: boolean;
  stationId?: string | null;
  prices?: PlacePrice[];
  favorite?: boolean;
  partnerBenefit?: { description: string } | null;
  confidence?: string | null;
  updatedAt?: number | null;
  entityType?: string;
  entityId?: string;
  commentCount?: number;
  rating?: PlaceRating;
};
export type PlaceCategory = {
  key: string;
  label: string;
  icon: IconName;
  color: string;
  /** Símbolo textual usado no mapa web do app, onde não há ícones vetoriais. */
  glyph: string;
};

export const PLACE_CATEGORIES: PlaceCategory[] = [
  { key: 'fuel', label: 'Postos', icon: 'gas-station', color: '#E85A24', glyph: '⛽' },
  { key: 'bakery', label: 'Padarias', icon: 'bread-slice', color: '#E89C12', glyph: '🥐' },
  {
    key: 'restaurant',
    label: 'Restaurantes',
    icon: 'silverware-fork-knife',
    color: '#D97706',
    glyph: '🍽'
  },
  { key: 'cafe', label: 'Cafeterias', icon: 'coffee', color: '#8B5E34', glyph: '☕' },
  { key: 'supermarket', label: 'Mercados', icon: 'cart-outline', color: '#2563EB', glyph: '🛒' },
  { key: 'pharmacy', label: 'Farmácias', icon: 'medical-bag', color: '#D8323F', glyph: '💊' },
  {
    key: 'hospital',
    label: 'Hospitais',
    icon: 'hospital-box-outline',
    color: '#C81E2B',
    glyph: '✚'
  },
  { key: 'mechanic', label: 'Oficinas', icon: 'wrench-outline', color: '#4B5D70', glyph: '🔧' },
  { key: 'charge', label: 'Recarga elétrica', icon: 'ev-station', color: '#13A56E', glyph: '⚡' },
  { key: 'parking', label: 'Estacionamentos', icon: 'parking', color: '#0E9FC4', glyph: 'P' },
  { key: 'police', label: 'Polícia', icon: 'police-badge-outline', color: '#1D4ED8', glyph: '★' }
];
export const MAP_PLACE_CATEGORIES = [
  'fuel',
  'hospital',
  'pharmacy',
  'bakery',
  'restaurant',
  'supermarket',
  'mechanic',
  'charge'
];
export const FUEL_TYPES: Array<[string, string]> = [
  ['GASOLINE', 'Gasolina'],
  ['ADDITIVE_GASOLINE', 'Gasolina aditivada'],
  ['ETHANOL', 'Etanol'],
  ['DIESEL', 'Diesel'],
  ['DIESEL_S10', 'Diesel S10'],
  ['CNG', 'GNV']
];
const FUEL_LABELS = new Map(FUEL_TYPES);
const DEFAULT_VISUAL: PlaceCategory = {
  key: 'poi',
  label: 'Local',
  icon: 'map-marker',
  color: '#10283B',
  glyph: '●'
};

export function placeVisual(category?: string): PlaceCategory {
  return PLACE_CATEGORIES.find(item => item.key === category) || DEFAULT_VISUAL;
}
export function fuelLabel(fuelType: string) {
  return FUEL_LABELS.get(String(fuelType).toUpperCase()) || fuelType;
}
export function money(value: number) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}
export function distanceLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '';
  return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
}
export function bestPrice(place: Place) {
  const prices = (place.prices || []).filter(price => Number.isFinite(Number(price.price)));
  if (!prices.length) return null;
  return prices.reduce((best, price) => (price.price < best.price ? price : best));
}
export function placeEntity(place: Place) {
  return {
    entityType: place.entityType || (place.stationId ? 'FUEL_STATION' : 'POI'),
    entityId: place.entityId || place.stationId || place.placeKey
  };
}
export function openPlace(place: Place, tab: 'prices' | 'comments' | '' = '') {
  router.push({
    // As rotas tipadas são geradas pelo Expo em tempo de build; a rota
    // app/place/[key].tsx existe, mas pode não constar na união gerada.
    pathname: '/place/[key]' as never,
    params: { key: place.placeKey, data: JSON.stringify(place), tab }
  });
}

export function PlaceBadge({ category, size = 36 }: { category?: string; size?: number }) {
  const visual = placeVisual(category);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: visual.color + '22',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Icon name={visual.icon} size={size * 0.56} color={visual.color} />
    </View>
  );
}

export function PlaceCard({
  place,
  width,
  onOpen
}: {
  place: Place;
  width?: number;
  onOpen?: (place: Place, tab: 'prices' | 'comments' | '') => void;
}) {
  const { theme } = useApp();
  const visual = placeVisual(place.category);
  const price = place.category === 'fuel' ? bestPrice(place) : null;
  const open = onOpen || openPlace;
  const rating = place.rating?.count
    ? `★ ${Number(place.rating.average).toFixed(1).replace('.', ',')} (${place.rating.count})`
    : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${place.name}`}
      onPress={() => open(place, '')}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.86 : 1 })}
    >
      <Card style={{ gap: 9, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PlaceBadge category={place.category} size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}
            >
              {place.name}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 11 }}>
              {[place.brand || visual.label, distanceLabel(place.distanceMeters)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {place.favorite && <Icon name="heart" size={18} color={theme.colors.danger} />}
        </View>
        {place.category === 'fuel' ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: price ? theme.colors.success + '1F' : theme.colors.cardElevated
            }}
          >
            <Text
              style={{
                color: price ? theme.colors.success : theme.colors.muted,
                fontSize: price ? 20 : 13,
                fontWeight: '900'
              }}
            >
              {price ? money(price.price) : 'Sem preço informado'}
            </Text>
            {price && (
              <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.muted, fontSize: 10 }}>
                {fuelLabel(price.fuelType)} · {price.confirmations || 0} confirmação(ões)
              </Text>
            )}
          </View>
        ) : (
          !!place.address && (
            <Text numberOfLines={2} style={{ color: theme.colors.muted, fontSize: 12 }}>
              {place.address}
            </Text>
          )
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {!!rating && (
            <Text style={{ color: '#B7791F', fontSize: 11, fontWeight: '900' }}>{rating}</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="comment-text-outline" size={13} color={theme.colors.muted} />
            <Text style={{ color: theme.colors.muted, fontSize: 11 }}>
              {place.commentCount
                ? `${place.commentCount} comentário(s)`
                : 'Nenhum comentário ainda'}
            </Text>
          </View>
          {!!place.partnerBenefit && (
            <Text numberOfLines={1} style={{ color: theme.colors.success, fontSize: 11 }}>
              Parceiro: {place.partnerBenefit.description}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {place.category === 'fuel' && (
            <SmallAction icon="cash" label="Preços" primary onPress={() => open(place, 'prices')} />
          )}
          <SmallAction
            icon="comment-text-outline"
            label="Comentários"
            primary={place.category !== 'fuel'}
            onPress={() => open(place, 'comments')}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function SmallAction({
  icon,
  label,
  primary,
  onPress
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();
  const color = primary ? '#FFFFFF' : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: primary ? 'transparent' : theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : theme.colors.cardElevated,
        opacity: pressed ? 0.78 : 1
      })}
    >
      <Icon name={icon} size={16} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  );
}

export function PlaceCarousel({
  places,
  emptyTitle,
  emptyMessage,
  onOpen
}: {
  places: Place[];
  emptyTitle: string;
  emptyMessage: string;
  onOpen?: (place: Place, tab: 'prices' | 'comments' | '') => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(290, Math.max(220, width - 72));
  if (!places.length) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <FlatList
      horizontal
      data={places}
      keyExtractor={item => item.placeKey || item.id}
      renderItem={({ item }) => <PlaceCard place={item} width={cardWidth} onOpen={onOpen} />}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + 10}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={{ gap: 10, paddingRight: 24, paddingVertical: 2 }}
      style={{ marginHorizontal: -4, paddingHorizontal: 4 }}
    />
  );
}

export function CategoryChips({
  value,
  categories,
  onChange
}: {
  value: string;
  categories: PlaceCategory[];
  onChange: (key: string) => void;
}) {
  const { theme } = useApp();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {categories.map(category => {
        const active = category.key === value;
        return (
          <Pressable
            key={category.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(category.key)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              minHeight: 34,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? category.color : theme.colors.border,
              backgroundColor: active ? category.color + '1F' : theme.colors.card,
              opacity: pressed ? 0.8 : 1
            })}
          >
            <Icon
              name={category.icon}
              size={15}
              color={active ? category.color : theme.colors.muted}
            />
            <Text
              style={{
                color: active ? category.color : theme.colors.text,
                fontSize: 12,
                fontWeight: '800'
              }}
            >
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
