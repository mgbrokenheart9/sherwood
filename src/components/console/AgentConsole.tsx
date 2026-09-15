"use client";

import {
  Cube,
  CurrencyCircleDollar,
  Database,
  Robot,
  ShieldCheck,
  SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { AppWindow, Stage } from "@/components/ui/AppWindow";
import { cx } from "@/lib/cn";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { formatNumber, shorten } from "@/lib/format";
import { Chip, ModeChip } from "./controls";
import { AgentsPanel } from "./panels/AgentsPanel";
import { BlockchainPanel } from "./panels/BlockchainPanel";
import { MemoryPanel } from "./panels/MemoryPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { PaymentsPanel } from "./panels/PaymentsPanel";
import { PrivacyPanel } from "./panels/PrivacyPanel";
import { useWallet } from "./panels/WalletPanel";
import { useRuntimeState } from "./runtime-provider";

export type ConsoleTab = "overview" | "privacy" | "payments" | "blockchain" | "agents" | "memory";

const TABS: { id: ConsoleTab; label: string; title: string; icon: Icon }[] = [
  { id: "overview", label: "Overview", title: "Overview", icon: SquaresFour },
  { id: "privacy", label: "Privacy", title: "Privacy context", icon: ShieldCheck },
  { id: "payments", label: "Payments", title: "Payment context · x402", icon: CurrencyCircleDollar },
  { id: "blockchain", label: "Blockchain", title: "Blockchain context", icon: Cube },
  { id: "agents", label: "Agents", title: "Agent deployment context", icon: Robot },
  { id: "memory", label: "Memory", title: "Persistent memory", icon: Database },
];

export function AgentConsole() {
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const wallet = useWallet();
  const mode = useRuntimeState((snapshot) => snapshot.mode);
  const activeNetwork = useRuntimeState((snapshot) => snapshot.blockchain.networks.find((network) => network.id === ACTIVE_NETWORK.id));
  const activity = useRuntimeState((snapshot) => snapshot.activity);
  const agents = useRuntimeState((snapshot) => snapshot.agents.agents);
  const proofs = useRuntimeState((snapshot) => snapshot.privacy.proofs);
  const payments = useRuntimeState((snapshot) => snapshot.payment.payments);
  const transactions = useRuntimeState((snapshot) => snapshot.blockchain.transactions);

  const counts: Partial<Record<ConsoleTab, number>> = {
    privacy: proofs.length,
    payments: payments.length,
    blockchain: transactions.length,
    agents: agents.filter((agent) => agent.status === "running").length,
  };
  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <Stage tone="deep">
      <AppWindow
        title="sherwood · agent console"
        className="console-app"
        actions={
          <>
            <ModeChip mode={mode} />
            <Chip tone={wallet ? "ok" : undefined}>
              <span className={cx("dot", !wallet && "dot--off")} aria-hidden="true" />
              {wallet ? shorten(wallet.address, 6, 4) : "No wallet"}
            </Chip>
          </>
        }
      >
        <div className="app__body">
          <aside className="app__side">
            <div className="app__brand">
              <BrandMark size={18} />
              <span>sherwood</span>
            </div>

            <nav className="app__nav" aria-label="Console sections">
              {TABS.map(({ id, label, icon: TabIcon }) => (
                <button
                  key={id}
                  type="button"
                  className="app__nav-item"
                  aria-current={tab === id ? "true" : undefined}
                  onClick={() => setTab(id)}
                >
                  <TabIcon size={17} />
                  {label}
                  {counts[id] ? <span className="app__nav-meta">{counts[id]}</span> : null}
                </button>
              ))}
            </nav>

            <div>
              <div className="app__group-label">Recent activity</div>
              {activity.length === 0 ? (
                <p className="row__sub" style={{ padding: "0 10px" }}>
                  Nothing yet
                </p>
              ) : (
                activity.slice(0, 5).map((event) => (
                  <div key={event.id} className="tree-item" data-state="done" title={event.message}>
                    <span className={cx("dot", event.status === "error" && "dot--err")} aria-hidden="true" />
                    <span className="truncate">{event.message}</span>
                  </div>
                ))
              )}
            </div>

            <div className="app__side-foot">
              <div className="tree-item" title={`${ACTIVE_NETWORK.name} · chain ${ACTIVE_NETWORK.chainId}`}>
                <span
                  className={cx(
                    "dot",
                    activeNetwork?.status === "offline" && "dot--err",
                    activeNetwork?.source === "simulated" && "dot--warn",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{ACTIVE_NETWORK.testnet ? "Robinhood testnet" : "Robinhood mainnet"}</span>
                <span className="app__nav-meta">{activeNetwork ? `#${formatNumber(activeNetwork.blockNumber)}` : "…"}</span>
              </div>
            </div>
          </aside>

          <div className="app__main">
            <div className="app__main-head">
              <h3 className="app__main-title">{current.title}</h3>
            </div>
            <div className="app__scroll" role="region" aria-label={current.title}>
              {tab === "overview" && <OverviewPanel onNavigate={setTab} />}
              {tab === "privacy" && <PrivacyPanel />}
              {tab === "payments" && <PaymentsPanel />}
              {tab === "blockchain" && <BlockchainPanel />}
              {tab === "agents" && <AgentsPanel />}
              {tab === "memory" && <MemoryPanel />}
            </div>
          </div>
        </div>
      </AppWindow>
    </Stage>
  );
}
