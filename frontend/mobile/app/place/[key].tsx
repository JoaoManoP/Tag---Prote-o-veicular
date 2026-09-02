import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import {
  FUEL_TYPES,
  PlaceBadge,
  distanceLabel,
  fuelLabel,
  money,
  placeEntity,
  placeVisual,
  type Place,
  type PlacePrice
} from '../../src/components/places';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Input,
  LoadingState,
  Screen,
  StatusBadge,
  styles
} from '../../src/components/ui';
import { api, ApiError } from '../../src/services/api';
import { useApp } from '../../src/state/AppContext';

type Comment = {
  id: string;
  body: string;
  author: { displayName: string };
  likes: number;
  mine: boolean;
  createdAt: number;
};

function parsePlace(raw?: string): Place | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Place;
    return value && typeof value === 'object' && value.placeKey ? value : null;
  } catch {
    return null;
  }
}
function distanceBetween(a: { latitude: number; longitude: number }, b: Place) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(value));
}

export default function PlaceDetail() {
  const { theme } = useApp();
  const params = useLocalSearchParams<{ key: string; data?: string; tab?: string }>();
  const [place, setPlace] = useState<Place | null>(() => parsePlace(params.data));
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [body, setBody] = useState('');
  const [fuelType, setFuelType] = useState('GASOLINE');
  const [priceInput, setPriceInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const commentsOffset = useRef(0);
  const visual = placeVisual(place?.category);
  const entity = useMemo(() => (place ? placeEntity(place) : null), [place]);

  const refresh = useCallback(async () => {
    if (!place) return;
    try {
      const data = await api.get<{ places: Place[] }>(
        `/api/places/nearby?lat=${place.latitude}&lng=${place.longitude}&categories=${place.category}&radiusMeters=300&limit=12`
      );
      const match = data.places.find(
        item =>
          item.placeKey === place.placeKey ||
          (place.stationId && item.stationId === place.stationId) ||
          distanceBetween(place, item) <= 40
      );
      if (match)
        setPlace(current => ({
          ...(current || place),
          ...match,
          distanceMeters: current?.distanceMeters ?? match.distanceMeters
        }));
    } catch {}
  }, [place?.placeKey]);

  const loadComments = useCallback(async () => {
    if (!entity) return;
    setCommentsLoading(true);
    try {
      const data = await api.get<{ comments: Comment[] }>(
        `/api/platform/comments/${entity.entityType}/${encodeURIComponent(entity.entityId)}`
      );
      setComments(data.comments);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Comentários indisponíveis.');
    } finally {
      setCommentsLoading(false);
    }
  }, [entity?.entityType, entity?.entityId]);

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    void loadComments();
  }, [loadComments]);
  useEffect(() => {
    if (params.tab === 'comments' && !commentsLoading && commentsOffset.current)
      scrollRef.current?.scrollTo({ y: commentsOffset.current - 12, animated: true });
  }, [commentsLoading]);

  const notify = (error: unknown, fallback: string) =>
    setMessage(error instanceof ApiError || error instanceof Error ? error.message : fallback);

  const submitPrice = async () => {
    if (!place) return;
    const price = Number(priceInput.replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0 || price > 100)
      return setMessage('Informe um preço válido por litro.');
    setBusy(true);
    try {
      const payload = { fuelType, price, observedAt: Date.now() };
      const result = place.stationId
        ? await api.securePost<{ station?: Place }>(
            `/api/platform/stations/${place.stationId}/prices`,
            payload
          )
        : await api.securePost<{ station?: Place }>(
            `/api/platform/places/${encodeURIComponent(place.placeKey)}/prices`,
            {
              ...payload,
              place: {
                name: place.name,
                brand: place.brand,
                address: place.address,
                latitude: place.latitude,
                longitude: place.longitude,
                phone: place.phone,
                source: 'OpenStreetMap'
              }
            }
          );
      if (result.station)
        setPlace(current =>
          current
            ? {
                ...current,
                stationId: result.station!.id,
                registered: true,
                prices: result.station!.prices,
                entityType: 'FUEL_STATION',
                entityId: result.station!.id
              }
            : current
        );
      setPriceInput('');
      setMessage('Preço enviado para validação da comunidade.');
    } catch (error) {
      notify(error, 'Não foi possível enviar o preço.');
    } finally {
      setBusy(false);
    }
  };
  const confirmPrice = async (price: PlacePrice) => {
    if (!place?.stationId) return;
    setBusy(true);
    try {
      const result = await api.securePut<{ confirmations: number; status: string }>(
        `/api/platform/stations/${place.stationId}/prices/${price.id}/confirm`,
        {}
      );
      setPlace(current =>
        current
          ? {
              ...current,
              prices: (current.prices || []).map(item =>
                item.id === price.id
                  ? { ...item, confirmations: result.confirmations, status: result.status }
                  : item
              )
            }
          : current
      );
      setMessage(`Preço confirmado por ${result.confirmations} pessoa(s).`);
    } catch (error) {
      notify(error, 'Não foi possível confirmar.');
    } finally {
      setBusy(false);
    }
  };
  const toggleFavorite = async () => {
    if (!place?.stationId) return;
    try {
      if (place.favorite)
        await api.secureDelete(`/api/platform/stations/${place.stationId}/favorite`);
      else await api.securePost(`/api/platform/stations/${place.stationId}/favorite`);
      setPlace(current => (current ? { ...current, favorite: !current.favorite } : current));
    } catch (error) {
      notify(error, 'Não foi possível atualizar o favorito.');
    }
  };
  const submitComment = async () => {
    if (!entity) return;
    const value = body.trim();
    if (value.length < 2) return setMessage('Escreva um comentário com pelo menos 2 caracteres.');
    setBusy(true);
    try {
      await api.securePost(
        `/api/platform/comments/${entity.entityType}/${encodeURIComponent(entity.entityId)}`,
        { body: value }
      );
      setBody('');
      setMessage('Comentário publicado.');
      await loadComments();
    } catch (error) {
      notify(error, 'Não foi possível publicar.');
    } finally {
      setBusy(false);
    }
  };
  const like = async (comment: Comment) => {
    try {
      await api.securePut(`/api/platform/comments/${comment.id}/reaction`, { reaction: 'LIKE' });
      await loadComments();
    } catch (error) {
      notify(error, 'Não foi possível reagir.');
    }
  };

  if (!place)
    return (
      <Screen>
        <Header title="Local" />
        <EmptyState
          title="Local não encontrado"
          message="Abra o local novamente a partir do mapa ou da comunidade."
        />
      </Screen>
    );

  const pricesByType = new Map(
    (place.prices || []).map(price => [String(price.fuelType).toUpperCase(), price])
  );

  return (
    <Screen scroll={false} style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title={place.name}
          subtitle={[place.brand || visual.label, distanceLabel(place.distanceMeters)]
            .filter(Boolean)
            .join(' · ')}
          action={<PlaceBadge category={place.category} size={44} />}
        />
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={place.registered ? 'COMUNIDADE' : 'OPENSTREETMAP'} />
            {!!place.rating?.count && (
              <Text style={{ color: '#B7791F', fontWeight: '900', fontSize: 12 }}>
                ★ {Number(place.rating.average).toFixed(1).replace('.', ',')} ({place.rating.count})
              </Text>
            )}
          </View>
          <InfoRow icon="map-marker-outline" text={place.address || 'Endereço não informado'} />
          {!!place.openingHours && <InfoRow icon="clock-outline" text={place.openingHours} />}
          {!!place.phone && (
            <Pressable onPress={() => Linking.openURL(`tel:${place.phone}`)}>
              <InfoRow icon="phone-outline" text={place.phone} accent />
            </Pressable>
          )}
          {!!place.partnerBenefit && (
            <InfoRow
              icon="tag-heart-outline"
              text={`Parceiro: ${place.partnerBenefit.description}`}
              accent
            />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                compact
                secondary
                icon="navigation-variant-outline"
                title="Como chegar"
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
                  )
                }
              />
            </View>
            {place.registered && !!place.stationId && (
              <View style={{ flex: 1 }}>
                <Button
                  compact
                  secondary
                  icon={place.favorite ? 'heart' : 'heart-outline'}
                  title={place.favorite ? 'Favorito' : 'Favoritar'}
                  onPress={toggleFavorite}
                />
              </View>
            )}
          </View>
        </Card>
        {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}

        {place.category === 'fuel' && (
          <Card style={{ gap: 10 }}>
            <SectionLabel icon="cash" title="Lista de preços" />
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              Valores informados pela comunidade. Nada é estimado; confirme o que você viu.
            </Text>
            <View style={{ gap: 8 }}>
              {FUEL_TYPES.map(([type, label]) => {
                const price = pricesByType.get(type);
                return (
                  <View
                    key={type}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 12,
                      backgroundColor: price
                        ? theme.colors.success + '1A'
                        : theme.colors.cardElevated,
                      borderWidth: 1,
                      borderColor: price ? theme.colors.success + '55' : theme.colors.border
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}
                      >
                        {label}
                      </Text>
                      <Text
                        style={{
                          color: price ? theme.colors.success : theme.colors.muted,
                          fontSize: price ? 19 : 12,
                          fontWeight: '900'
                        }}
                      >
                        {price ? money(price.price) : 'Não informado'}
                      </Text>
                      {!!price && (
                        <Text style={{ color: theme.colors.muted, fontSize: 10 }}>
                          {price.status === 'CONFIRMED' ? 'Confirmado' : 'Aguardando confirmação'} ·{' '}
                          {price.confirmations || 0} confirmação(ões)
                          {price.observedAt
                            ? ` · ${new Date(price.observedAt).toLocaleDateString('pt-BR')}`
                            : ''}
                        </Text>
                      )}
                    </View>
                    {!!price && (
                      <Button
                        compact
                        secondary
                        icon="check"
                        title="Confirmar"
                        disabled={busy}
                        onPress={() => confirmPrice(price)}
                      />
                    )}
                  </View>
                );
              })}
            </View>
            <View
              style={{
                gap: 8,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.colors.border
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                Informar preço observado
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {FUEL_TYPES.map(([type, label]) => {
                    const active = fuelType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setFuelType(type)}
                        style={{
                          paddingHorizontal: 11,
                          minHeight: 32,
                          justifyContent: 'center',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.accent : theme.colors.border,
                          backgroundColor: active ? theme.colors.accent + '1F' : theme.colors.card
                        }}
                      >
                        <Text
                          style={{
                            color: active ? theme.colors.primaryBright : theme.colors.text,
                            fontSize: 12,
                            fontWeight: '800'
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              <Input
                label={`Preço por litro (${fuelLabel(fuelType)})`}
                value={priceInput}
                onChangeText={setPriceInput}
                keyboardType="decimal-pad"
                placeholder="Ex.: 5,89"
              />
              <Button
                icon="send"
                title="Enviar preço"
                disabled={busy || !Number(priceInput.replace(',', '.'))}
                onPress={submitPrice}
              />
              <Text style={[styles.caption, { color: theme.colors.muted }]}>
                O preço fica pendente até ser confirmado por outras pessoas.
              </Text>
            </View>
          </Card>
        )}

        <View onLayout={event => (commentsOffset.current = event.nativeEvent.layout.y)}>
          <Card style={{ gap: 10 }}>
            <SectionLabel
              icon="comment-text-multiple-outline"
              title={`Comentários${comments.length ? ` (${comments.length})` : ''}`}
            />
            <Input
              label="Sua experiência"
              value={body}
              maxLength={1000}
              multiline
              onChangeText={setBody}
              placeholder="Sem telefone, e-mail ou dados de terceiros"
            />
            <Button
              icon="send"
              title="Publicar comentário"
              disabled={busy || body.trim().length < 2}
              onPress={submitComment}
            />
            {commentsLoading ? (
              <LoadingState label="Carregando comentários…" />
            ) : comments.length ? (
              comments.map(comment => (
                <View
                  key={comment.id}
                  style={{
                    gap: 4,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.cardElevated
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>
                      {comment.author?.displayName || 'Usuário'}
                      {comment.mine ? ' (você)' : ''}
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 10 }}>
                      {new Date(comment.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
                    {comment.body}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => like(comment)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}
                  >
                    <Icon name="thumb-up-outline" size={14} color={theme.colors.primaryBright} />
                    <Text
                      style={{ color: theme.colors.primaryBright, fontSize: 11, fontWeight: '800' }}
                    >
                      Útil ({comment.likes || 0})
                    </Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={[styles.caption, { color: theme.colors.muted }]}>
                Ainda não há comentários. Compartilhe sua experiência com a comunidade.
              </Text>
            )}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({
  icon,
  title
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
}) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={18} color={theme.colors.primaryBright} />
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900' }}>{title}</Text>
    </View>
  );
}
function InfoRow({
  icon,
  text,
  accent
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  text: string;
  accent?: boolean;
}) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Icon
        name={icon}
        size={16}
        color={accent ? theme.colors.primaryBright : theme.colors.muted}
      />
      <Text
        style={{
          flex: 1,
          color: accent ? theme.colors.primaryBright : theme.colors.textSoft,
          fontSize: 12,
          lineHeight: 17
        }}
      >
        {text}
      </Text>
    </View>
  );
}
