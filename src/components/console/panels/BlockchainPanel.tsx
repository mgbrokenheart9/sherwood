"use client";

import { ArrowUpRight, ArrowsClockwise, Check, Cube, DownloadSimple, Globe, PaperPlaneTilt, Rocket } from "@phosphor-icons/react/dist/ssr";
import { useState, type FormEvent } from "react";
import { ACTIVE_NETWORK, explorerAddress } from "@/lib/chain/config";
import { REGISTRY_ABI, REGISTRY_BYTECODE, REGISTRY_COMPILER } from "@/lib/chain/registry-artifact";
import { formatNumber, formatRelative, shorten } from "@/lib/format";
import type { NetworkStatus } from "@/lib/runtime/types";
import { ActionButton, Chip, Empty, Field, Notice, PanelSection, TxLink } from "../controls";
import { useAction, useRuntimeState } from "../runtime-provider";
import { WalletGate, useRuntimeMode } from "./WalletPanel";

const REGISTRY_FUNCTIONS = REGISTRY_ABI.flatMap((item) =>
  item.type === "function" ? [`${item.name}(${item.inputs.map((input) => input.type).join(", ")})`] : [],
);
const REGISTRY_BYTES = (REGISTRY_BYTECODE.length - 2) / 2;

function SourceChip({ network }: { network: NetworkStatus }) {
  if (network.status === "offline") return <Chip tone="err">Offline</Chip>;
  return network.source === "rpc" ? <Chip tone="ok">Live RPC</Chip> : <Chip tone="warn">Simulated</Chip>;
}

/** Robinhood Chain networks with live block height, gas price and RPC latency. */
export function NetworkList() {
  const networks = useRuntimeState((snapshot) => snapshot.blockchain.networks);
  const refresh = useAction("refreshNetworks");

  return (
    <div className="panel">
      <PanelSection
        label="Networks"
        end={
          <ActionButton
            size="sm"
            aria-label="Refresh networks"
            icon={<ArrowsClockwise size={13} />}
            pending={refresh.pending}
            onClick={() => void refresh.run({})}
          />
        }
      >
        {networks.length === 0 ? (
          <Empty>Connecting to Robinhood Chain…</Empty>
        ) : (
          <div className="list" aria-label="Robinhood Chain networks">
            {networks.map((network) => (
              <div key={network.id} className="list__item">
                <Globe className="row__icon" size={19} />
                <span className="row__main">
                  <span>{network.name}</span>
                  <span className="row__sub">
                    Block {formatNumber(network.blockNumber)} · {network.gasPriceGwei} gwei
                    {network.source === "rpc" ? ` · ${network.latencyMs} ms` : ""}
                  </span>
                </span>
                <span className="row__end">
                  <SourceChip network={network} />
                  {network.id === ACTIVE_NETWORK.id && <Check size={16} aria-label="Active network" />}
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
      <PanelSection>
        <p className="row__sub row__sub--wrap">
          Chain ID {ACTIVE_NETWORK.chainId} · ~100 ms blocks · ETH gas ·{" "}
          <a className="txlink" href={ACTIVE_NETWORK.explorerUrl} target="_blank" rel="noopener noreferrer">
            Explorer
            <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
          </a>
        </p>
      </PanelSection>
    </div>
  );
}

export function BlockchainPanel() {
  return (
    <div className="cols">
      <div className="stack">
        <NetworkList />
        <TransactionList />
      </div>
      <WalletGate reason={`Connect a wallet to deploy contracts and send transactions on ${ACTIVE_NETWORK.name}.`}>
        <div className="stack">
          <RegistryCard />
          <TransactionForm />
        </div>
      </WalletGate>
    </div>
  );
}

function RegistryCard() {
  const mode = useRuntimeMode();
  const registry = useRuntimeState((snapshot) => snapshot.blockchain.registries[ACTIVE_NETWORK.id]);
  const deploy = useAction("deployRegistry");
  const importRegistry = useAction("useRegistry");
  const [address, setAddress] = useState("");

  const onImport = (event: FormEvent) => {
    event.preventDefault();
    void importRegistry.run({ address });
  };

  const onChain = registry && (registry.source !== "deployed" || registry.tx?.mode === "live");

  return (
    <div className="panel">
      <PanelSection label="ZKx8004 registry" end={<span>{ACTIVE_NETWORK.name}</span>}>
        <div className="stack">
          {registry ? (
            <div className="row">
              <Cube className="row__icon" size={18} />
              <span className="row__main">
                {onChain ? (
                  <a className="txlink mono" href={explorerAddress(ACTIVE_NETWORK, registry.address)} target="_blank" rel="noopener noreferrer">
                    {shorten(registry.address, 8, 6)}
                    <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="mono">{shorten(registry.address, 8, 6)}</span>
                )}
                <span className="row__sub">
                  {registry.tx ? (
                    <>
                      Deployed in <TxLink tx={registry.tx} />
                    </>
                  ) : (
                    "Existing contract"
                  )}{" "}
                  · {formatRelative(registry.deployedAt)}
                </span>
              </span>
              <span className="row__end">
                <Chip tone="ok">{registry.source}</Chip>
              </span>
            </div>
          ) : (
            <p className="muted">No registry on this network yet. Deploy one to anchor proofs, register agents and record executions on-chain.</p>
          )}

          <ActionButton variant={registry ? "default" : "primary"} icon={<Rocket size={16} />} pending={deploy.pending} onClick={() => void deploy.run({})} block>
            {registry ? "Deploy a new registry" : "Deploy registry"}
          </ActionButton>
          <p className="row__sub row__sub--wrap">
            Solidity {REGISTRY_COMPILER.solc.split("+")[0]} · EVM {REGISTRY_COMPILER.evmVersion} · {formatNumber(REGISTRY_BYTES)} bytes
            {mode === "live" ? " · needs ETH for gas" : ""}
          </p>
          {deploy.status === "error" && <Notice tone="error">{deploy.error}</Notice>}
          {deploy.status === "success" && (
            <Notice tone="success">
              Registry live at {shorten(deploy.result.address, 6, 4)}
              {deploy.result.tx && (
                <>
                  {" "}
                  · <TxLink tx={deploy.result.tx} />
                </>
              )}
            </Notice>
          )}
        </div>
      </PanelSection>

      <PanelSection label="Use an existing registry">
        <form className="stack" onSubmit={onImport}>
          <div className="input-group">
            <input
              className="input input--mono"
              placeholder="0x…"
              aria-label="Registry address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
            />
            <ActionButton type="submit" icon={<DownloadSimple size={15} />} pending={importRegistry.pending} disabled={!address}>
              Use
            </ActionButton>
          </div>
          {importRegistry.status === "error" && <Notice tone="error">{importRegistry.error}</Notice>}
        </form>
      </PanelSection>

      <PanelSection label="Contract interface">
        <ul className="abi-list">
          {REGISTRY_FUNCTIONS.map((signature) => (
            <li key={signature} className="mono">
              {signature}
            </li>
          ))}
        </ul>
      </PanelSection>
    </div>
  );
}

function TransactionForm() {
  const mode = useRuntimeMode();
  const execute = useAction("executeTransaction");
  const [to, setTo] = useState("");
  const [data, setData] = useState("");
  const [value, setValue] = useState("0");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void execute.run({ to, data, value: value.trim() === "" ? 0 : Number(value) });
  };

  return (
    <form className="panel" onSubmit={onSubmit}>
      <PanelSection label="Send transaction">
        <div className="stack">
          <Field label="Destination">
            <input className="input input--mono" placeholder="0x…" value={to} onChange={(event) => setTo(event.target.value)} spellCheck={false} />
          </Field>
          <div className="grid-2">
            <Field label="Data" hint="text or 0x calldata">
              <input className="input input--mono" placeholder="optional" value={data} onChange={(event) => setData(event.target.value)} />
            </Field>
            <Field label="Value (ETH)">
              <input className="input" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          </div>
          {mode === "live" && <p className="row__sub row__sub--wrap">This sends a real transaction from your wallet on {ACTIVE_NETWORK.name}.</p>}
          <ActionButton type="submit" icon={<PaperPlaneTilt size={16} />} pending={execute.pending} disabled={!to} block>
            Send transaction
          </ActionButton>
          {execute.status === "error" && <Notice tone="error">{execute.error}</Notice>}
          {execute.status === "success" && (
            <Notice tone="success">
              Confirmed in block {formatNumber(execute.result.tx.blockNumber)} · <TxLink tx={execute.result.tx} />
            </Notice>
          )}
        </div>
      </PanelSection>
    </form>
  );
}

function TransactionList() {
  const transactions = useRuntimeState((snapshot) => snapshot.blockchain.transactions);

  return (
    <div className="panel">
      <PanelSection label="Transactions" end={<span>{transactions.length}</span>}>
        {transactions.length === 0 ? (
          <Empty>No transactions yet.</Empty>
        ) : (
          <div className="list">
            {transactions.slice(0, 8).map((transaction) => (
              <div key={`${transaction.tx.hash}-${transaction.kind}`} className="list__item">
                <PaperPlaneTilt className="row__icon" size={17} />
                <span className="row__main">
                  <TxLink tx={transaction.tx} />
                  <span className="row__sub">
                    {transaction.data} {transaction.to ? `→ ${shorten(transaction.to, 6, 4)}` : ""} · {formatRelative(transaction.createdAt)}
                  </span>
                </span>
                <span className="row__end">
                  <Chip tone={transaction.tx.mode === "live" ? "ok" : undefined}>{transaction.kind}</Chip>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}
