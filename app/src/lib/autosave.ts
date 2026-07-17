/**
 * Write-through autosave outbox. Operational inputs save locally first
 * (IndexedDB), then flush to the active DAL adapter. The UI surfaces
 * SyncState so an operator always knows whether input is safe.
 */
import { get, set } from "idb-keyval";

export type SyncState = "saved-local" | "syncing" | "synced" | "error";

export interface OutboxEntry<T = unknown> {
  id: string;
  kind: string;
  payload: T;
  queuedAt: string;
  attempts: number;
}

const OUTBOX_KEY = "shbbq.outbox.v1";

export async function enqueue<T>(kind: string, payload: T): Promise<OutboxEntry<T>> {
  const entry: OutboxEntry<T> = {
    id: crypto.randomUUID(), kind, payload,
    queuedAt: new Date().toISOString(), attempts: 0,
  };
  const box = ((await get(OUTBOX_KEY)) as OutboxEntry[] | undefined) ?? [];
  box.push(entry as OutboxEntry);
  await set(OUTBOX_KEY, box);
  return entry;
}

export async function drain(
  send: (e: OutboxEntry) => Promise<void>,
  onState?: (id: string, s: SyncState) => void,
): Promise<{ sent: number; failed: number }> {
  const box = ((await get(OUTBOX_KEY)) as OutboxEntry[] | undefined) ?? [];
  const remaining: OutboxEntry[] = [];
  let sent = 0, failed = 0;
  for (const e of box) {
    try {
      onState?.(e.id, "syncing");
      await send(e);
      onState?.(e.id, "synced");
      sent++;
    } catch {
      e.attempts++;
      remaining.push(e);
      onState?.(e.id, "error");
      failed++;
    }
  }
  await set(OUTBOX_KEY, remaining);
  return { sent, failed };
}

export async function pending(): Promise<number> {
  const box = ((await get(OUTBOX_KEY)) as OutboxEntry[] | undefined) ?? [];
  return box.length;
}
