import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Position } from '../types';
const KEY = 'rastreon:position-queue:v1';
export type QueueState = 'pending' | 'syncing' | 'synced' | 'failed';
export function mergeQueue(current: Position[], position: Position) {
  if (current.some(item => item.eventId === position.eventId)) return current;
  return [...current, position].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).slice(-2000);
}
export async function listQueue() {
  const raw = await AsyncStorage.getItem(KEY);
  try {
    return (raw ? JSON.parse(raw) : []) as Position[];
  } catch {
    return [];
  }
}
export async function enqueuePosition(position: Position) {
  const current = await listQueue(),
    next = mergeQueue(current, position);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next.length;
}
export async function confirmSequences(sequences: number[]) {
  const accepted = new Set(sequences);
  const next = (await listQueue()).filter(item => !accepted.has(item.sequence || -1));
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next.length;
}
export async function clearQueue() {
  await AsyncStorage.removeItem(KEY);
}
