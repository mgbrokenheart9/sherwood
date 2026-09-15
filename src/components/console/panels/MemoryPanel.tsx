"use client";

import { Database, DownloadSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { formatBytes, formatClock, formatNumber, formatRelative } from "@/lib/format";
import { ActionButton, Chip, Empty, Notice, PanelSection } from "../controls";
import { useAction, useRuntime, useRuntimeState } from "../runtime-provider";

const PIPELINE = [
  { title: "1. Context creation", body: "Isolated contexts with their own memory and state" },
  { title: "2. Composition", body: "Contexts composed with the .use() pattern" },
  { title: "3. Action execution", body: "Type-safe actions validated by schemas" },
  { title: "4. Memory persistence", body: "State persists across sessions automatically" },
] as const;

export function MemoryPanel() {
  const runtime = useRuntime();
  const memory = useRuntimeState((snapshot) => snapshot.memory);
  const reset = useAction("resetRuntime");
  const [confirming, setConfirming] = useState(false);

  const exportState = () => {
    const { wallet, privacy, payment, blockchain, agents, activity, memory: stats } = runtime.getSnapshot();
    const state = { exportedAt: new Date().toISOString(), wallet, privacy, payment, blockchain, agents, activity, memory: stats };
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sherwood-runtime-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onReset = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    await reset.run({});
  };

  return (
    <div className="stack stack--lg">
      <ol className="pipeline">
        {PIPELINE.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            {step.body}
          </li>
        ))}
      </ol>

      <div className="cols">
        <div className="panel">
          <PanelSection label="Working memory">
            <dl className="kv">
              <dt>Session</dt>
              <dd className="mono">{memory.sessionId || "—"}</dd>
              <dt>Working keys</dt>
              <dd>{memory.workingKeys}</dd>
              <dt>Persisted size</dt>
              <dd>{formatBytes(memory.totalBytes)}</dd>
              <dt>Last activity</dt>
              <dd>{memory.lastActivity ? formatClock(memory.lastActivity) : "—"}</dd>
            </dl>
          </PanelSection>
          <PanelSection label="Active contexts">
            <div className="check__tags">
              {memory.activeContexts.length === 0 ? (
                <Empty>Hydrating…</Empty>
              ) : (
                memory.activeContexts.map((context) => (
                  <Chip key={context} tone="ok">
                    {context}
                  </Chip>
                ))
              )}
            </div>
          </PanelSection>
          <PanelSection label="Maintenance">
            <div className="stack">
              <ActionButton icon={<DownloadSimple size={16} />} onClick={exportState} block>
                Export state as JSON
              </ActionButton>
              <ActionButton
                variant="danger"
                icon={<Trash size={16} />}
                pending={reset.pending}
                onClick={() => void onReset()}
                onBlur={() => setConfirming(false)}
                block
              >
                {confirming ? "Click again to erase everything" : "Reset runtime"}
              </ActionButton>
              {reset.status === "success" && <Notice tone="success">Runtime reset. All persisted memory was cleared.</Notice>}
              {reset.status === "error" && <Notice tone="error">{reset.error}</Notice>}
            </div>
          </PanelSection>
        </div>

        <div className="panel">
          <PanelSection label="Context memory" end={<span>{memory.contexts.length} stores</span>}>
            {memory.contexts.length === 0 ? (
              <Empty>No context memory yet.</Empty>
            ) : (
              <div className="list">
                {memory.contexts.map((context) => (
                  <div key={context.contextId} className="list__item">
                    <Database className="row__icon" size={17} />
                    <span className="row__main">
                      <span className="mono">{context.contextId}</span>
                      <span className="row__sub">
                        {context.keys} keys · {formatNumber(context.accessCount)} reads/writes · {formatRelative(context.updatedAt)}
                      </span>
                    </span>
                    <span className="row__end">
                      <Chip>{formatBytes(context.bytes)}</Chip>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PanelSection>
        </div>
      </div>
    </div>
  );
}
