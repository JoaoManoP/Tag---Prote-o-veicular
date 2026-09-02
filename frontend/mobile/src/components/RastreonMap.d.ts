import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { Geofence, Position } from '../types';

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  kind?: string;
  label?: string;
  /** Categoria do local (fuel, hospital, bakery…) quando kind === 'poi'. */
  category?: string;
  /** Nome exibido ao lado do pino quando kind === 'poi'. */
  name?: string;
  /** Carga útil do ponto (por exemplo, o Place completo) devolvida em onPointPress. */
  data?: unknown;
};

export type RastreonMapProps = {
  focus?: Position;
  vehiclePosition?: Position;
  phonePosition?: Position;
  track?: Position[];
  geofences?: Geofence[];
  points?: MapPoint[];
  perspective?: boolean;
  follow?: boolean;
  onUserInteraction?: () => void;
  onPointPress?: (point: MapPoint) => void;
  showUserLocation?: boolean;
  onMapReady?: () => void;
  onMapError?: () => void;
};

export const RastreonMap: ForwardRefExoticComponent<RastreonMapProps & RefAttributes<any>>;
