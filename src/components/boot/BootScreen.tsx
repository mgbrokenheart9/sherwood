"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cx } from "@/lib/cn";
import { highlight } from "@/lib/highlight";
import { useBoot } from "./boot-context";

const LINE_MS = 240;
const HOLD_MS = 900;
const FADE_MS = 500;

const BOOT_LINES = [
  "Initializing Sherwood Agent Platform...",
  "Loading private agent modules...",
  "Connecting to Robinhood Chain...",
  "Setting up ZKx8004 payment integration...",
  "Deploying quantum-resistant security...",
  "Configuring autonomous operations...",
  "Loading developer APIs...",
  "Setting up privacy protocols...",
  "Initializing agent deployment system...",
  "Loading zero-knowledge proof engines...",
  "Compiling privacy-preserving algorithms...",
  "Connecting to decentralized network...",
  "Validating cryptographic protocols...",
  "Boot sequence complete. Welcome to Sherwood.",
  "",
  "▸ Agent Platform Ready",
  "◆ Deploy your private agents now",
  "⬢ Zero-knowledge privacy active",
  "⟡ Lightning-fast blockchain integration",
];

const SNIPPETS = [
  `// ZKx8004 Agent Deployment
const agent = new ZKx8004Agent({
  privacy: 'zero-knowledge',
  blockchain: 'robinhood-chain',
  payment: 'anonymous'
});

agent.deploy({
  type: 'trading',
  strategy: 'defi-optimization'
});`,
  `// API Integration
import { ZKx8004API } from '@zkx8004/sdk';

const api = new ZKx8004API({
  endpoint: 'agent-launch',
  encryption: 'zero-knowledge'
});

const response = await api.createAgent({
  name: 'PrivateTradingBot'
});`,
  `// Payment Processing
const payment = await zkx8004.process({
  type: 'anonymous',
  amount: 1_000_000n, // 1 USDG
  privacy: 'zk-proof',
  agent: 'autonomous'
});`,
];

export function BootScreen() {
  const { ready, complete } = useBoot();
  const [line, setLine] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const finish = useCallback(() => {
    setLeaving(true);
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(complete, FADE_MS);
  }, [complete]);

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  // Returning visitors (or reduced motion) were marked before paint: skip immediately.
  useEffect(() => {
    if (document.documentElement.dataset.boot === "done") complete();
  }, [complete]);

  useEffect(() => {
    if (ready || leaving) return;
    const done = line >= BOOT_LINES.length;
    const timer = setTimeout(() => (done ? finish() : setLine((value) => value + 1)), done ? HOLD_MS : LINE_MS);
    return () => clearTimeout(timer);
  }, [line, ready, leaving, finish]);

  useEffect(() => {
    if (ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    const root = document.documentElement;
    root.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      root.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ready, finish]);

  useEffect(() => {
    const screen = screenRef.current;
    if (screen) screen.scrollTop = screen.scrollHeight;
  }, [line]);

  if (ready) return null;

  const progress = Math.min(line / BOOT_LINES.length, 1);

  return (
    <div className="boot" data-state={leaving ? "leaving" : "active"} role="dialog" aria-modal="true" aria-label="Sherwood boot sequence">
      <div className="boot__inner">
        <div className="boot__head">
          <BrandMark size={44} />
          <h2 className="boot__title">Sherwood Agent Platform</h2>
          <p className="metaline">Private agents, powered by ZKx8004</p>
        </div>

        <div className="boot__term">
          <div className="boot__bar">
            <span>sherwood-terminal</span>
            <button type="button" className="boot__skip" onClick={finish}>
              Press ESC to skip
            </button>
          </div>

          <div className="boot__screen" ref={screenRef}>
            <div className="boot__cmd">
              <span className="term__prompt">$</span> zkx8004 launch-agent --type=private --privacy=zk-proof
            </div>

            {BOOT_LINES.slice(0, line).map((text, index) => (
              <div key={index} className={cx("boot__line", index >= BOOT_LINES.length - 4 && "boot__line--final")}>
                {text || " "}
                {index === line - 1 && line < BOOT_LINES.length && <span className="term__caret" aria-hidden="true" />}
              </div>
            ))}

            {line > 5 && (
              <div className="boot__code" aria-hidden="true">
                {SNIPPETS.map((snippet, index) => (
                  <pre key={index} style={{ opacity: line > 6 + index * 2 ? 1 : 0 }}>
                    {highlight(snippet)}
                  </pre>
                ))}
              </div>
            )}
          </div>

          <div className="boot__progress">
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="metaline">{Math.round(progress * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
