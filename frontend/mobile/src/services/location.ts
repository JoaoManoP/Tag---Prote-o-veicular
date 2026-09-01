import * as Location from 'expo-location';
import type { Position } from '../types';
const subscriptions = new Set<Location.LocationSubscription>();
export async function requestLocationPermission(background = false) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  if (background) {
    const result = await Location.requestBackgroundPermissionsAsync();
    return result.status === 'granted';
  }
  return true;
}
export async function currentLocation() {
  const value = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return mapLocation(value);
}
export async function watchLocation(onPosition: (position: Position) => void) {
  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
    value => onPosition(mapLocation(value))
  );
  subscriptions.add(subscription);
  return {
    remove() {
      subscription.remove();
      subscriptions.delete(subscription);
    }
  };
}
export function stopLocation() {
  subscriptions.forEach(subscription => subscription.remove());
  subscriptions.clear();
}
function mapLocation(value: Location.LocationObject): Position {
  return {
    latitude: value.coords.latitude,
    longitude: value.coords.longitude,
    accuracy: value.coords.accuracy || 0,
    speed: value.coords.speed,
    heading: value.coords.heading,
    altitude: value.coords.altitude,
    timestamp: value.timestamp
  };
}
