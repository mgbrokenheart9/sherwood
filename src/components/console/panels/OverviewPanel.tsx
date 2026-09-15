"use client";

import { ArrowRight, ArrowUpRight, CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { cx } from "@/lib/cn";
import { formatAmount, formatRelative } from "@/lib/format";
import type { ConsoleTab } from "../AgentConsole";
import { ActionButton, Chip, Empty, ModeChip, PanelSection } from "../controls";
import { useRuntimeState } from "../runtime-provider";
import { WalletConnect, WalletSummary, useRuntimeMode, useWallet } from "./WalletPanel";

export function OverviewPanel({ onNavigate }: { onNavigate: (tab: ConsoleTab) => void }) {
  const wallet = useWallet();
  const mode = useRuntimeMode();
  const registry = useRuntimeState((snapshot) => snapshot.blockchain.registries[ACTIVE_NETWORK.id]);
  const agents = useRuntimeState((snapshot) => snapshot.agents.agents);
  const executions = useRuntimeState((snapshot) => snapshot.agents.executions);
  const payments = useRuntimeState((snapshot) => snapshot.payment.payments);
  const proofs = useRuntimeState((snapshot) => snapshot.privacy.proofs);
  const transactions = useRuntimeState((snapshot) => snapshot.blockchain.transactions);
  const activity = useRuntimeState((snapshot) => snapshot.activity);

  const steps: { label: string; done: boolean; tab: ConsoleTab }[] = [
    { label: "Connect wallet", done: Boolean(wallet), tab: "overview" },
    { label: "Deploy the registry", done: Boolean(registry), tab: "blockchain" },
    { label: "Deploy an agent on-chain", done: agents.some((agent) => agent.registration), tab: "agents" },
    { label: "Run a command", done: executions.some((execution) => execution.status === "completed"), tab: "agents" },
  ];
  const next = steps.find((step) => !step.done);

  const volume = payments.reduce((sum, payment) => (payment.currency === "USDG" ? sum + payment.amount : sum), 0);
  const stats = [
    { label: "Running agents", value: agents.filter((agent) => agent.status === "running").length },
    { label: "Executions", value: executions.length },
    { label: "USDG settled", value: formatAmount(volume, undefined, 2) },
    { label: "Anchored proofs", value: `${proofs.filter((proof) => proof.anchor).length}/${proofs.length}` },
    { label: "Transactions", value: transactions.length },
    { label: "Live transactions", value: transactions.filter((transaction) => transaction.tx.mode === "live").length },
  ];

  return (
    <div className="stack stack--lg">
      <div className="cols">
        <div className="panel">
          <PanelSection label="Getting started" end={<span>{steps.filter((step) => step.done).length}/4</span>}>
            <ul className="checklist">
              {steps.map((step) => (
                <li key={step.label} data-done={step.done}>
                  {step.done ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
                  {step.label}
                </li>
              ))}
            </ul>
          </PanelSection>
          <PanelSection>
            {!wallet ? (
              <WalletConnect />
            ) : next ? (
              <ActionButton variant="primary" icon={<ArrowRight size={15} />} onClick={() => onNavigate(next.tab)}>
                Continue: {next.label}
              </ActionButton>
            ) : (
              <p className="muted">All steps complete. Your private agent is live on {ACTIVE_NETWORK.name}.</p>
            )}
          </PanelSection>
        </div>

        {wallet ? (
          <WalletSummary />
        ) : (
          <div className="panel">
            <PanelSection label={ACTIVE_NETWORK.name} end={<ModeChip mode={mode} />}>
              <p className="muted">
                Connect MetaMask, Rabby or Coinbase Wallet to transact for real on {ACTIVE_NETWORK.name}. The demo wallet simulates everything
                locally and starts with 0.5 ETH and 1,000 USDG.
              </p>
            </PanelSection>
          </div>
        )}
      </div>

      <div className="stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat">
            <div className="stat__value">{stat.value}</div>
            <div className="stat__label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <PanelSection label="Activity" end={<span>{activity.length} events</span>}>
          {activity.length === 0 ? (
            <Empty>Actions you run in any context appear here.</Empty>
          ) : (
            <div className="list">
              {activity.slice(0, 12).map((event) => (
                <div key={event.id} className="list__item">
                  <span className={cx("dot", event.status === "error" && "dot--err")} aria-hidden="true" />
                  <span className="row__main">
                    <span className="row__sub--wrap">{event.message}</span>
                    <span className="row__sub">
                      {event.action} · {formatRelative(event.at)}
                      {event.explorerUrl && (
                        <>
                          {" · "}
                          <a className="txlink" href={event.explorerUrl} target="_blank" rel="noopener noreferrer">
                            explorer
                            <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
                          </a>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="row__end">
                    <Chip>{event.context}</Chip>
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelSection>
      </div>
    </div>
  );
}
