/**
 * Base class for composable contexts (Daydreams-style).
 * Each context owns an immutable state slice, persists it to context memory
 * and declares its dependencies through `.use()`.
 */

import type { MemoryManager } from "../memory";
import type { ContextId } from "../types";
import type { Latency } from "../utils";

export interface RuntimeOptions {
  /** Read live Robinhood Chain data over RPC. Disabled in offline tests. */
  rpc: boolean;
  /** Base URL for the x402 API routes; empty means same origin. */
  apiBase: string;
}

export interface ContextDeps {
  memory: MemoryManager;
  latency: Latency;
  options: RuntimeOptions;
  notify: () => void;
}

export abstract class BaseContext<TState extends object = object> {
  abstract readonly id: ContextId;
  abstract readonly name: string;
  abstract readonly description: string;

  /** State keys that are rebuilt at runtime instead of being persisted. */
  protected readonly transientKeys: readonly PropertyKey[] = [];

  protected readonly memory: MemoryManager;
  protected readonly latency: Latency;
  protected readonly options: RuntimeOptions;
  protected state: TState;
  private readonly notify: () => void;
  private readonly dependencies = new Map<ContextId, BaseContext>();

  constructor(deps: ContextDeps) {
    this.memory = deps.memory;
    this.latency = deps.latency;
    this.options = deps.options;
    this.notify = deps.notify;
    this.state = this.initialState();
  }

  protected abstract initialState(): TState;

  /** Hook that runs after hydration and reset. */
  protected onHydrate(): void {
    // Optional in subclasses.
  }

  get snapshot(): TState {
    return this.state;
  }

  hydrate(): void {
    this.memory.activate(this.id);
    const saved = this.memory.get<Partial<TState>>(this.id, "state") ?? {};
    this.state = { ...this.initialState(), ...this.persistable(saved) };
    this.onHydrate();
  }

  reset(): void {
    this.state = this.initialState();
    this.onHydrate();
  }

  /** Compose another context into this one. */
  use(context: BaseContext): this {
    this.dependencies.set(context.id, context);
    return this;
  }

  protected dependency<T extends BaseContext>(id: ContextId): T {
    const context = this.dependencies.get(id);
    if (!context) throw new Error(`${this.name} requires the ${id} context. Compose it with .use().`);
    return context as T;
  }

  protected setState(patch: Partial<TState>, { persist = true }: { persist?: boolean } = {}): void {
    this.state = { ...this.state, ...patch };
    if (persist) this.memory.set(this.id, "state", this.persistable(this.state));
    this.notify();
  }

  private persistable(source: Partial<TState>): Partial<TState> {
    const result = { ...source } as Record<PropertyKey, unknown>;
    for (const key of this.transientKeys) delete result[key];
    return result as Partial<TState>;
  }
}
