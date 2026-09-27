"use client";

// ============================================================================
// T9 client-side offline queue.
// Records created offline are stored locally with a client-generated UUID
// (tempUuid) and a SHA-256 integrity hash; "Sync" pushes them idempotently.
// No sensitive case data is cached — only what the UDC is actively entering.
// ============================================================================

export interface OfflineItem {
  tempUuid: string;
  payloadType: "APPLICATION" | "STATEMENT" | "DOCUMENT";
  payload: Record<string, unknown>;
  integrityHash?: string;
  editedExistingId?: string;
  createdAt: string;
  status: "QUEUED" | "SYNCED" | "CONFLICT";
  syncedEntityId?: string;
}

const KEY = "dlas_offline_queue_v1";
const DEVICE_KEY = "dlas_device_id";

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8).toUpperCase();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return `UDC-${id}`;
}

export function readQueue(): OfflineItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as OfflineItem[];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function enqueue(payloadType: OfflineItem["payloadType"], payload: Record<string, unknown>): Promise<OfflineItem> {
  const item: OfflineItem = {
    tempUuid: crypto.randomUUID(),
    payloadType,
    payload,
    integrityHash: await sha256Hex(JSON.stringify(payload)),
    createdAt: new Date().toISOString(),
    status: "QUEUED",
  };
  writeQueue([...readQueue(), item]);
  return item;
}

/** Push all queued items. Idempotent server-side by tempUuid. */
export async function syncQueue(): Promise<{ tempUuid: string; status: string; entityId?: string }[]> {
  const queued = readQueue().filter((i) => i.status === "QUEUED");
  if (queued.length === 0) return [];
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: deviceId(), items: queued.map((i) => ({ ...i })) }),
  });
  if (!res.ok) throw new Error("SYNC_FAILED");
  const data = (await res.json()) as { results: { tempUuid: string; status: string; entityId?: string }[] };
  const items = readQueue();
  for (const r of data.results) {
    const item = items.find((i) => i.tempUuid === r.tempUuid);
    if (item) {
      item.status = r.status === "CONFLICT" ? "CONFLICT" : "SYNCED";
      item.syncedEntityId = r.entityId;
    }
  }
  writeQueue(items);
  return data.results;
}

export function clearSynced(): void {
  writeQueue(readQueue().filter((i) => i.status === "QUEUED"));
}

export { deviceId };
