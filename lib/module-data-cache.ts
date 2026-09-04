const CACHE_VERSION = 1;
const CACHE_PREFIX = `better-tracker:module-data:v${CACHE_VERSION}`;
const disabledUsers = new Set<string>();

export const MODULE_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const AUTH_USER_MARKER_COOKIE_NAME = "better_tracker_user";

type Snapshot<T> = {
  version: number;
  dataKey: string;
  savedAt: number;
  data: T;
};

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function browserAuthenticatedUserId(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${AUTH_USER_MARKER_COOKIE_NAME}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(prefix.length)) || null;
  } catch {
    return null;
  }
}

function userPrefix(userId: string): string {
  return `${CACHE_PREFIX}:${encodeURIComponent(userId)}:`;
}

function snapshotKey(userId: string, slot: string): string {
  return `${userPrefix(userId)}${encodeURIComponent(slot)}`;
}

export function readModuleDataSnapshot<T>(
  userId: string,
  slot: string,
  dataKey: string,
  now = Date.now(),
): T | null {
  if (disabledUsers.has(userId) || browserAuthenticatedUserId() !== userId) return null;
  const storage = sessionStorageOrNull();
  if (!storage) return null;

  const key = snapshotKey(userId, slot);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as Partial<Snapshot<T>>;
    if (
      snapshot.version !== CACHE_VERSION
      || snapshot.dataKey !== dataKey
      || typeof snapshot.savedAt !== "number"
      || now - snapshot.savedAt > MODULE_DATA_MAX_AGE_MS
      || !("data" in snapshot)
    ) {
      storage.removeItem(key);
      return null;
    }
    return snapshot.data ?? null;
  } catch {
    return null;
  }
}

export function writeModuleDataSnapshot<T>(
  userId: string,
  slot: string,
  dataKey: string,
  data: T,
  savedAt = Date.now(),
): void {
  if (disabledUsers.has(userId) || browserAuthenticatedUserId() !== userId) return;
  const storage = sessionStorageOrNull();
  if (!storage) return;
  try {
    storage.setItem(snapshotKey(userId, slot), JSON.stringify({
      version: CACHE_VERSION,
      dataKey,
      savedAt,
      data,
    } satisfies Snapshot<T>));
  } catch {
    // Storage may be unavailable or full; live data still works without it.
  }
}

export function clearModuleDataSnapshots(userId: string): void {
  disabledUsers.add(userId);
  const storage = sessionStorageOrNull();
  if (!storage) return;
  const prefix = userPrefix(userId);
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) storage.removeItem(key);
    }
  } catch {
    // Logout still succeeds when browser storage is unavailable.
  }
}
