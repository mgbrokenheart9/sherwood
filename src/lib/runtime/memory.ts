/**
 * ZKx8004 persistent memory system.
 * Dual-tier architecture: Working Memory (session lifetime, in-process) and
 * Context Memory (persistent per context, with optional per-key TTL).
 */

import type { ContextId } from "./types";

export const STORAGE_PREFIX = "zkx8004:memory:";

interface MemoryEntry {
  value: unknown;
  updatedAt: string;
  expiresAt?: number;
}

interface ContextStore {
  contextId: ContextId;
  entries: Record<string, MemoryEntry>;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

export interface ContextMemoryStats {
  contextId: ContextId;
  keys: number;
  bytes: number;
  accessCount: number;
  updatedAt: string;
}

export interface MemoryStats {
  sessionId: string;
  workingKeys: number;
  activeContexts: ContextId[];
  lastActivity: string;
  contexts: ContextMemoryStats[];
  totalBytes: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function createInMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

function resolveStorage(): StorageLike {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = `${STORAGE_PREFIX}probe`;
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // Private mode or blocked storage: fall back to memory only.
  }
  return createInMemoryStorage();
}

export class MemoryManager {
  readonly sessionId: string;
  private storage: StorageLike | null = null;
  private readonly stores = new Map<ContextId, ContextStore>();
  private readonly working = new Map<string, unknown>();
  private readonly active = new Set<ContextId>();
  private lastActivity = new Date().toISOString();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private get backend(): StorageLike {
    this.storage ??= resolveStorage();
    return this.storage;
  }

  private touch(): void {
    this.lastActivity = new Date().toISOString();
  }

  /* ------------------------------------------------------- working memory */

  setWorking(key: string, value: unknown): void {
    this.working.set(key, value);
    this.touch();
  }

  getWorking<T>(key: string): T | undefined {
    this.touch();
    return this.working.get(key) as T | undefined;
  }

  /* ------------------------------------------------------- context memory */

  private load(contextId: ContextId): ContextStore {
    const cached = this.stores.get(contextId);
    if (cached) return cached;

    const now = new Date().toISOString();
    let store: ContextStore = { contextId, entries: {}, createdAt: now, updatedAt: now, accessCount: 0 };

    try {
      const raw = this.backend.getItem(STORAGE_PREFIX + contextId);
      if (raw) store = { ...store, ...(JSON.parse(raw) as ContextStore) };
    } catch {
      // Corrupted payload: start from a clean store.
    }

    this.stores.set(contextId, store);
    return store;
  }

  private write(store: ContextStore): void {
    try {
      this.backend.setItem(STORAGE_PREFIX + store.contextId, JSON.stringify(store));
    } catch {
      // Quota exceeded: keep the in-memory copy so the session keeps working.
    }
  }

  get<T>(contextId: ContextId, key: string): T | undefined {
    const store = this.load(contextId);
    const entry = store.entries[key];
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.delete(contextId, key);
      return undefined;
    }

    store.accessCount++;
    this.touch();
    return entry.value as T;
  }

  set(contextId: ContextId, key: string, value: unknown, ttlMs?: number): void {
    const store = this.load(contextId);
    const now = new Date().toISOString();
    store.entries[key] = { value, updatedAt: now, expiresAt: ttlMs ? Date.now() + ttlMs : undefined };
    store.updatedAt = now;
    store.accessCount++;
    this.touch();
    this.write(store);
  }

  delete(contextId: ContextId, key: string): void {
    const store = this.load(contextId);
    if (!(key in store.entries)) return;
    delete store.entries[key];
    store.updatedAt = new Date().toISOString();
    this.write(store);
  }

  keys(contextId: ContextId): string[] {
    return Object.keys(this.load(contextId).entries);
  }

  /* ------------------------------------------------------------- lifecycle */

  activate(contextId: ContextId): void {
    this.active.add(contextId);
  }

  deactivate(contextId: ContextId): void {
    this.active.delete(contextId);
  }

  /** Drop cached stores so the next read comes from storage (cross-tab sync). */
  invalidate(): void {
    this.stores.clear();
  }

  /** Remove every persisted ZKx8004 key from storage. */
  clear(): void {
    const keys: string[] = [];
    for (let i = 0; i < this.backend.length; i++) {
      const key = this.backend.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => this.backend.removeItem(key));
    this.stores.clear();
    this.working.clear();
    this.touch();
  }

  stats(): MemoryStats {
    const contexts = Array.from(this.active, (contextId) => {
      const store = this.load(contextId);
      return {
        contextId,
        keys: Object.keys(store.entries).length,
        bytes: new Blob([JSON.stringify(store.entries)]).size,
        accessCount: store.accessCount,
        updatedAt: store.updatedAt,
      };
    });

    return {
      sessionId: this.sessionId,
      workingKeys: this.working.size,
      activeContexts: Array.from(this.active),
      lastActivity: this.lastActivity,
      contexts,
      totalBytes: contexts.reduce((sum, context) => sum + context.bytes, 0),
    };
  }
}
