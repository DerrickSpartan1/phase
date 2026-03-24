const AUTO_UPDATE_MARKER_KEY = "phase:auto-updated-at";
const AUTO_UPDATE_MARKER_MAX_AGE_MS = 2 * 60 * 1000;

export function markPendingAutoUpdate(): void {
  sessionStorage.setItem(AUTO_UPDATE_MARKER_KEY, String(Date.now()));
}

export function consumeRecentAutoUpdateMarker(): boolean {
  const marker = sessionStorage.getItem(AUTO_UPDATE_MARKER_KEY);
  if (!marker) return false;

  sessionStorage.removeItem(AUTO_UPDATE_MARKER_KEY);

  const updatedAt = Number(marker);
  if (!Number.isFinite(updatedAt)) return false;

  return Date.now() - updatedAt < AUTO_UPDATE_MARKER_MAX_AGE_MS;
}
