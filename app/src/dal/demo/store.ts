/** Generic IndexedDB-backed collection store for demo mode. */
import { get, set } from "idb-keyval";

const PREFIX = "shbbq.demo.col.";

export async function loadCol<T>(key: string, seed: () => T[]): Promise<T[]> {
  const stored = (await get(PREFIX + key)) as T[] | undefined;
  if (stored) return stored;
  const fresh = seed();
  await set(PREFIX + key, fresh);
  return fresh;
}

export async function saveCol<T>(key: string, rows: T[]): Promise<void> {
  await set(PREFIX + key, rows);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
