import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { Geofence, Position } from '../types';

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  kind?: string;
  label?: string;
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
  showUserLocation?: boolean;
  onMapReady?: () => void;
  onMapError?: () => void;
};

export const RastreonMap: ForwardRefExoticComponent<
  RastreonMapProps & RefAttributes<any>
>;
