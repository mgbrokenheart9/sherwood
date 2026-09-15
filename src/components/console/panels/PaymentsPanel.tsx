"use client";

import { ArrowsClockwise, LockKey, PaperPlaneTilt, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState, type FormEvent } from "react";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { formatAmount, formatRelative, shorten } from "@/lib/format";
import { randomAddress } from "@/lib/runtime/crypto";
import type { Currency, FeePriority, Payment, PaymentMethod } from "@/lib/runtime/types";
import { ActionButton, Chip, Empty, Field, Notice, PanelSection, Segmented, Switch, TxLink } from "../controls";
import { useAction, useRuntime, useRuntimeState } from "../runtime-provider";
import { WalletGate, WalletSummary, useRuntimeMode } from "./WalletPanel";

const METHODS = [
  { value: "x402", label: "x402 · EIP-3009" },
  { value: "transfer", label: "Transfer" },
] as const;

const CURRENCIES = [
  { value: "USDG", label: "USDG" },
  { value: "ETH", label: "ETH" },
] as const;

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export function PaymentsPanel({ layout = "split" }: { layout?: "split" | "stacked" }) {
  return (
    <WalletGate reason={`Connect a wallet to send ETH and USDG on ${ACTIVE_NETWORK.name}.`}>
      <div className={layout === "split" ? "cols" : "stack"}>
        <div className="stack">
          <WalletSummary />
          <PaymentForm />
        </div>
        <div className="stack">
          <PremiumResource />
          <PaymentHistory limit={layout === "split" ? 8 : 4} />
        </div>
      </div>
    </WalletGate>
  );
}

function Trace({ payment }: { payment: Payment }) {
  return (
    <ol className="trace">
      {payment.trace.map((step) => (
        <li key={step.label}>
          <span className="trace__time mono">+{step.offsetMs}ms</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function PaymentForm() {
  const runtime = useRuntime();
  const mode = useRuntimeMode();
  const pay = useAction("processPayment");
  const gasPriceGwei = useRuntimeState(
    (snapshot) => snapshot.blockchain.networks.find((network) => network.id === ACTIVE_NETWORK.id)?.gasPriceGwei,
  );

  const [amount, setAmount] = useState("2.5");
  const [currency, setCurrency] = useState<Currency>("USDG");
  const [method, setMethod] = useState<PaymentMethod>("x402");
  const [recipient, setRecipient] = useState("");
  const [memo, setMemo] = useState("API access · 1 request");
  const [priority, setPriority] = useState<FeePriority>("medium");
  const [isPrivate, setIsPrivate] = useState(true);

  const estimate = runtime.payment.estimateFees({ currency, method, priority });

  const chooseMethod = (next: PaymentMethod) => {
    setMethod(next);
    if (next === "x402") setCurrency("USDG");
  };

  const chooseCurrency = (next: Currency) => {
    setCurrency(next);
    if (next === "ETH") setMethod("transfer");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void pay.run({
      amount: amount.trim() === "" ? Number.NaN : Number(amount),
      currency,
      recipient,
      memo: memo || undefined,
      priority,
      private: isPrivate,
      method,
    });
  };

  return (
    <form className="panel" onSubmit={onSubmit}>
      <PanelSection label="Send payment" end={<span>{ACTIVE_NETWORK.name}</span>}>
        <div className="stack">
          <div className="field">
            <span className="field__label">Method</span>
            <Segmented label="Payment method" value={method} options={METHODS} onChange={chooseMethod} />
          </div>

          <div className="grid-2">
            <Field label="Amount">
              <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <div className="field">
              <span className="field__label">Currency</span>
              <Segmented label="Currency" value={currency} options={CURRENCIES} onChange={chooseCurrency} />
            </div>
          </div>

          <Field label="Recipient">
            <div className="input-group">
              <input
                className="input input--mono"
                placeholder="0x…"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                spellCheck={false}
              />
              {mode === "demo" && (
                <ActionButton
                  aria-label="Generate test recipient"
                  title="Generate test recipient"
                  icon={<ArrowsClockwise size={15} />}
                  onClick={() => setRecipient(randomAddress())}
                />
              )}
            </div>
          </Field>

          <Field label="Memo" hint="optional, stays off-chain">
            <input className="input" value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={120} />
          </Field>

          <div className="field">
            <span className="field__label">
              <span>Priority</span>
              <span>
                ≈{estimate.total} ETH gas{gasPriceGwei ? ` · ${gasPriceGwei} gwei` : ""} · {estimate.estimatedTime}
              </span>
            </span>
            <Segmented label="Priority" value={priority} options={PRIORITIES} onChange={setPriority} />
          </div>

          <Switch
            label="Private transfer"
            hint={isPrivate ? "Attaches a zero-knowledge range proof" : "Amount and memo are public"}
            checked={isPrivate}
            onChange={setIsPrivate}
          />

          {mode === "live" && (
            <p className="row__sub row__sub--wrap">
              Your wallet will ask you to {method === "x402" ? "sign an authorization and then confirm the settlement" : "confirm the transaction"} on{" "}
              {ACTIVE_NETWORK.name}.{ACTIVE_NETWORK.testnet ? "" : " This moves real funds."}
            </p>
          )}

          <ActionButton type="submit" variant="primary" icon={<PaperPlaneTilt size={16} />} pending={pay.pending} block>
            {method === "x402" ? "Sign & settle" : "Send"}
          </ActionButton>

          {pay.status === "error" && <Notice tone="error">{pay.error}</Notice>}
          {pay.status === "success" && (
            <div className="notice notice--success">
              <p className="notice__title">
                Settled {formatAmount(pay.result.amount, pay.result.currency)} · <TxLink tx={pay.result.tx} />
              </p>
              <Trace payment={pay.result} />
            </div>
          )}
        </div>
      </PanelSection>
    </form>
  );
}

interface SupportedInfo {
  facilitatorConfigured: boolean;
  priceUsdg: string;
  payTo: string | null;
}

function isSupportedInfo(value: unknown): value is SupportedInfo {
  return typeof value === "object" && value !== null && "facilitatorConfigured" in value && "priceUsdg" in value;
}

function PremiumResource() {
  const mode = useRuntimeMode();
  const purchase = useAction("purchasePremium");
  const [info, setInfo] = useState<SupportedInfo | null>(null);

  useEffect(() => {
    if (mode !== "live") return;
    let active = true;
    fetch("/api/x402/supported", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: unknown) => {
        if (active && isSupportedInfo(data)) setInfo(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mode]);

  const facilitatorMissing = mode === "live" && info !== null && !info.facilitatorConfigured;

  return (
    <div className="panel">
      <PanelSection label="x402 paid resource" end={<Chip>{info?.priceUsdg ?? "0.01"} USDG</Chip>}>
        <div className="stack">
          <p className="muted">
            Unlock the private signal feed at <span className="mono">/api/x402/premium</span>. The server answers 402, your wallet signs an
            EIP-3009 authorization and the facilitator settles it on {ACTIVE_NETWORK.name}.
          </p>
          {facilitatorMissing && (
            <Notice tone="error">This server has no facilitator key yet. Set X402_FACILITATOR_PRIVATE_KEY to accept payments.</Notice>
          )}
          <ActionButton
            variant="primary"
            icon={<LockKey size={16} />}
            pending={purchase.pending}
            disabled={facilitatorMissing}
            onClick={() => void purchase.run({})}
            block
          >
            Buy with x402
          </ActionButton>
          {purchase.status === "error" && <Notice tone="error">{purchase.error}</Notice>}
          {purchase.status === "success" && (
            <div className="notice notice--success">
              <p className="notice__title">
                Unlocked · <TxLink tx={purchase.result.payment.tx} />
              </p>
              <Trace payment={purchase.result.payment} />
              <pre className="code-preview">{JSON.stringify(purchase.result.data, null, 2)}</pre>
            </div>
          )}
        </div>
      </PanelSection>
    </div>
  );
}

export function PaymentHistory({ limit }: { limit: number }) {
  const payments = useRuntimeState((snapshot) => snapshot.payment.payments);

  return (
    <div className="panel">
      <PanelSection label="Payment history" end={<span>{payments.length}</span>}>
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <div className="list">
            {payments.slice(0, limit).map((payment) => (
              <div key={payment.id} className="list__item">
                {payment.private ? <ShieldCheck className="row__icon" size={17} /> : <PaperPlaneTilt className="row__icon" size={17} />}
                <span className="row__main">
                  <span>
                    <span className="neg">−{formatAmount(payment.amount, payment.currency)}</span>
                    <span className="muted"> → {shorten(payment.recipient, 6, 4)}</span>
                  </span>
                  <span className="row__sub">
                    <TxLink tx={payment.tx} /> · {payment.memo ?? "No memo"} · {formatRelative(payment.createdAt)}
                  </span>
                </span>
                <span className="row__end">
                  <Chip tone={payment.method === "x402" ? "ok" : undefined}>{payment.method === "x402" ? "x402" : "Transfer"}</Chip>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}
