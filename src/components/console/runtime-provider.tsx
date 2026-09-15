"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ActionInput, ActionName } from "@/lib/runtime/actions";
import { STORAGE_PREFIX } from "@/lib/runtime/memory";
import { ZKRuntime, type ActionOutput, type RuntimeSnapshot } from "@/lib/runtime/runtime";
import { errorMessage } from "@/lib/runtime/utils";

const NETWORK_TICK_MS = 4000;
/** Live balances refresh every third network tick (12 seconds). */
const BALANCE_TICKS = 3;

const RuntimeContext = createContext<ZKRuntime | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => new ZKRuntime());

  useEffect(() => {
    runtime.hydrate();

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) runtime.rehydrate();
    };
    let ticks = 0;
    const tick = setInterval(() => {
      if (document.hidden) return;
      runtime.blockchain.tick();
      if (++ticks % BALANCE_TICKS === 0 && runtime.wallet.mode === "live") {
        void runtime.payment.refreshBalances().catch(() => undefined);
      }
    }, NETWORK_TICK_MS);

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(tick);
    };
  }, [runtime]);

  return <RuntimeContext value={runtime}>{children}</RuntimeContext>;
}

export function useRuntime(): ZKRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useRuntime must be used inside <RuntimeProvider>.");
  return runtime;
}

/** Subscribe to a slice of runtime state. Selectors must return existing references. */
export function useRuntimeState<T>(selector: (snapshot: RuntimeSnapshot) => T): T {
  const runtime = useRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => selector(runtime.getSnapshot()),
    () => selector(runtime.getServerSnapshot()),
  );
}

type ActionState<N extends ActionName> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; result: ActionOutput<N> }
  | { status: "error"; error: string };

/** Run a runtime action and track its pending, success and error states. */
export function useAction<N extends ActionName>(name: N) {
  const runtime = useRuntime();
  const [state, setState] = useState<ActionState<N>>({ status: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (input: ActionInput<N>): Promise<ActionOutput<N> | undefined> => {
      setState({ status: "pending" });
      try {
        const result = await runtime.execute(name, input);
        if (mounted.current) setState({ status: "success", result });
        return result;
      } catch (error) {
        if (mounted.current) setState({ status: "error", error: errorMessage(error) });
        return undefined;
      }
    },
    [runtime, name],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { ...state, pending: state.status === "pending", run, reset };
}
