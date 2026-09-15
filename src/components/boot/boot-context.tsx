"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { BOOT_STORAGE_KEY } from "./prepaint";

interface BootValue {
  /** True once the boot sequence has finished or was skipped. */
  ready: boolean;
  complete: () => void;
}

const BootContext = createContext<BootValue>({ ready: true, complete: () => undefined });

export function BootProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  const complete = useCallback(() => {
    try {
      sessionStorage.setItem(BOOT_STORAGE_KEY, "1");
    } catch {
      // Storage can be blocked; the boot screen simply shows again next visit.
    }
    document.documentElement.dataset.boot = "done";
    setReady(true);
  }, []);

  const value = useMemo(() => ({ ready, complete }), [ready, complete]);
  return <BootContext value={value}>{children}</BootContext>;
}

export const useBoot = (): BootValue => useContext(BootContext);
