export function normalizePlate(value: string) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
}
export function isValidPlate(value: string) {
  return /^[A-Z]{3}(?:[0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(normalizePlate(value));
}
export function connectionState(lastUpdate: number | null, online: boolean, now = Date.now()) {
  if (!online) return 'OFFLINE';
  if (!lastUpdate) return 'ONLINE';
  return now - lastUpdate > 120000 ? 'STALE' : 'ONLINE';
}
