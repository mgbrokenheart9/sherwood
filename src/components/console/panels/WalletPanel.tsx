"use client";

import { ArrowUpRight, ArrowsClockwise, Coins, CurrencyCircleDollar, Plugs, Wallet as WalletIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState, type ReactNode } from "react";
import { ACTIVE_NETWORK, explorerAddress } from "@/lib/chain/config";
import { discoverInjectedWallets, type InjectedWallet } from "@/lib/chain/injected";
import { formatAmount, shorten } from "@/lib/format";
import { RUNTIME_TUNING } from "@/lib/runtime/catalog";
import type { Currency } from "@/lib/runtime/types";
import { ActionButton, Empty, ModeChip, Notice, PanelSection } from "../controls";
import { useAction, useRuntimeState } from "../runtime-provider";

const CURRENCIES: Currency[] = ["ETH", "USDG"];

export function useWallet() {
  return useRuntimeState((snapshot) => snapshot.wallet.wallet);
}

export function useRuntimeMode() {
  return useRuntimeState((snapshot) => snapshot.mode);
}

/** Demo wallets fall back to starting balances; live wallets show nothing until read from chain. */
export function useBalances() {
  const wallet = useWallet();
  const mode = useRuntimeMode();
  const balances = useRuntimeState((snapshot) => (wallet ? snapshot.payment.balances[wallet.address] : undefined));
  return balances ?? (mode === "demo" ? RUNTIME_TUNING.startingBalances : undefined);
}

function useInjectedWallets(): InjectedWallet[] | null {
  const [wallets, setWallets] = useState<InjectedWallet[] | null>(null);

  useEffect(() => {
    let active = true;
    void discoverInjectedWallets().then((found) => {
      if (active) setWallets(found);
    });
    return () => {
      active = false;
    };
  }, []);

  return wallets;
}

export function WalletConnect() {
  const connect = useAction("connectWallet");
  const wallets = useInjectedWallets();
  const [target, setTarget] = useState<string | null>(null);

  const run = (provider: "injected" | "demo", walletId?: string) => {
    setTarget(walletId ?? provider);
    void connect.run({ provider, walletId });
  };

  return (
    <div className="stack">
      <div className="input-group input-group--wrap">
        {wallets?.map((wallet) => (
          <ActionButton
            key={wallet.id}
            variant="primary"
            icon={<Plugs size={16} />}
            pending={connect.pending && target === wallet.id}
            disabled={connect.pending}
            onClick={() => run("injected", wallet.id)}
          >
            {wallet.name}
          </ActionButton>
        ))}
        <ActionButton
          variant={wallets?.length ? "default" : "primary"}
          icon={<WalletIcon size={16} />}
          pending={connect.pending && target === "demo"}
          disabled={connect.pending}
          onClick={() => run("demo")}
        >
          Use demo wallet
        </ActionButton>
      </div>
      {wallets?.length === 0 && (
        <p className="row__sub row__sub--wrap">
          No EVM wallet detected. Install MetaMask, Rabby or Coinbase Wallet to transact on {ACTIVE_NETWORK.name}.
        </p>
      )}
      {connect.status === "error" && <Notice tone="error">{connect.error}</Notice>}
    </div>
  );
}

/** Renders children only when a wallet is connected. */
export function WalletGate({ reason, children }: { reason: string; children: ReactNode }) {
  const hydrated = useRuntimeState((snapshot) => snapshot.hydrated);
  const wallet = useWallet();

  if (!hydrated) return <Empty>Loading runtime…</Empty>;
  if (!wallet) {
    return (
      <div className="panel">
        <PanelSection label="Wallet required">
          <div className="stack">
            <p className="muted">{reason}</p>
            <WalletConnect />
          </div>
        </PanelSection>
      </div>
    );
  }
  return children;
}

export function WalletSummary() {
  const wallet = useWallet();
  const mode = useRuntimeMode();
  const balances = useBalances();
  const airdrop = useAction("requestAirdrop");
  const refresh = useAction("refreshBalances");
  const disconnect = useAction("disconnectWallet");
  const reconnect = useAction("connectWallet");
  const [pendingCurrency, setPendingCurrency] = useState<Currency | null>(null);

  if (!wallet) return null;

  const wrongNetwork = mode === "live" && wallet.chainId !== ACTIVE_NETWORK.chainId;
  const failed = [airdrop, refresh, disconnect, reconnect].find((action) => action.status === "error");

  return (
    <div className="panel">
      <PanelSection
        label="Wallet"
        end={
          <ActionButton size="sm" pending={disconnect.pending} onClick={() => void disconnect.run({})}>
            Disconnect
          </ActionButton>
        }
      >
        <div className="row">
          <WalletIcon className="row__icon" size={18} />
          <span className="row__main">
            <span className="mono" title={wallet.address}>
              {shorten(wallet.address, 6, 6)}
            </span>
            <span className="row__sub">
              {wallet.walletName} · {ACTIVE_NETWORK.name}
            </span>
          </span>
          <span className="row__end">
            <ModeChip mode={mode} />
            {mode === "live" && (
              <a
                className="abtn abtn--sm abtn--icon"
                href={explorerAddress(ACTIVE_NETWORK, wallet.address)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View address on the explorer"
              >
                <ArrowUpRight size={13} />
              </a>
            )}
          </span>
        </div>

        {wrongNetwork && (
          <div className="notice notice--error">
            Your wallet is on chain {wallet.chainId}.{" "}
            <button type="button" className="txlink" onClick={() => void reconnect.run({ provider: "injected", walletId: wallet.walletId })}>
              Switch to {ACTIVE_NETWORK.name}
            </button>
          </div>
        )}

        {CURRENCIES.map((currency) => (
          <div className="row" key={currency}>
            {currency === "ETH" ? <Coins className="row__icon" size={18} /> : <CurrencyCircleDollar className="row__icon" size={18} />}
            <span>{balances ? formatAmount(balances[currency], currency, currency === "ETH" ? 6 : 2) : `— ${currency}`}</span>
            {mode === "demo" && (
              <span className="row__end">
                <ActionButton
                  size="sm"
                  pending={airdrop.pending && pendingCurrency === currency}
                  onClick={() => {
                    setPendingCurrency(currency);
                    void airdrop.run({ currency });
                  }}
                >
                  +{RUNTIME_TUNING.airdrop[currency]} {currency}
                </ActionButton>
              </span>
            )}
          </div>
        ))}

        {mode === "live" && (
          <div className="input-group input-group--wrap">
            <ActionButton size="sm" icon={<ArrowsClockwise size={13} />} pending={refresh.pending} onClick={() => void refresh.run({})}>
              Refresh
            </ActionButton>
            {ACTIVE_NETWORK.faucets.map((faucet) => (
              <a key={faucet.url} className="abtn abtn--sm" href={faucet.url} target="_blank" rel="noopener noreferrer">
                {faucet.label}
              </a>
            ))}
          </div>
        )}

        {failed?.status === "error" && <Notice tone="error">{failed.error}</Notice>}
      </PanelSection>
    </div>
  );
}
