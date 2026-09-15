/**
 * Blockchain Context: live Robinhood Chain status, the ZKx8004 registry
 * contract and transactions (real in live mode, simulated in demo mode).
 */

import { isHex, stringToHex, zeroHash, type Hex } from "viem";
import { ACTIVE_NETWORK, NETWORKS, NETWORK_IDS, registryEnvName, type NetworkConfig } from "@/lib/chain/config";
import { publicClientFor, readAnchor, readNetworkStatus } from "@/lib/chain/live";
import { GAS_UNITS, RUNTIME_TUNING } from "../catalog";
import { randomAddress, randomTxHash } from "../crypto";
import { liveTxRef } from "../tx";
import type { ChainTransaction, NetworkId, NetworkStatus, RegistryDeployment, TxRef } from "../types";
import { clamp, nowIso, round } from "../utils";
import { BaseContext } from "./base";
import type { PaymentContext } from "./payment";
import type { WalletContext } from "./wallet";

export interface BlockchainState {
  networks: NetworkStatus[];
  registries: Partial<Record<NetworkId, RegistryDeployment>>;
  transactions: ChainTransaction[];
}

const BLOCK_TIME_MS = 100;
const SIMULATED_BASE: Record<NetworkId, { blockNumber: number; gasPriceGwei: number }> = {
  "robinhood-mainnet": { blockNumber: 62_900_000, gasPriceGwei: 0.07 },
  "robinhood-testnet": { blockNumber: 119_400_000, gasPriceGwei: 0.01 },
};

const randomInt = (min: number, max: number): number => Math.floor(min + Math.random() * (max - min));

export class BlockchainContext extends BaseContext<BlockchainState> {
  readonly id = "blockchain";
  readonly name = "Blockchain Context";
  readonly description = "Robinhood Chain status, registry contract and transactions";

  protected override readonly transientKeys = ["networks"] as const;
  private lastTick = 0;
  private refreshing = false;

  protected initialState(): BlockchainState {
    return { networks: [], registries: {}, transactions: [] };
  }

  protected override onHydrate(): void {
    this.seedNetworks();
    this.applyConfiguredRegistries();
  }

  private get wallet(): WalletContext {
    return this.dependency<WalletContext>("wallet");
  }

  private get payment(): PaymentContext {
    return this.dependency<PaymentContext>("payment");
  }

  get activeNetwork(): NetworkConfig {
    return ACTIVE_NETWORK;
  }

  /* ------------------------------------------------------------ networks */

  private seedNetworks(): void {
    const updatedAt = nowIso();
    this.lastTick = Date.now();
    this.state = {
      ...this.state,
      networks: NETWORK_IDS.map((id) => ({
        id,
        name: NETWORKS[id].name,
        chainId: NETWORKS[id].chainId,
        status: "connected",
        source: "simulated",
        blockNumber: SIMULATED_BASE[id].blockNumber + randomInt(0, 5000),
        gasPriceGwei: SIMULATED_BASE[id].gasPriceGwei,
        latencyMs: 0,
        updatedAt,
      })),
    };
  }

  private applyConfiguredRegistries(): void {
    const registries = { ...this.state.registries };
    for (const id of NETWORK_IDS) {
      const configured = NETWORKS[id].registry;
      if (configured && !registries[id]) {
        registries[id] = { address: configured, network: id, source: "configured", deployedAt: nowIso() };
      }
    }
    this.state = { ...this.state, registries };
  }

  private advanceSimulated(): void {
    const now = Date.now();
    const produced = Math.max(1, Math.round((now - this.lastTick) / BLOCK_TIME_MS));
    this.lastTick = now;

    this.setState(
      {
        networks: this.state.networks.map((network) => ({
          ...network,
          blockNumber: network.blockNumber + produced,
          gasPriceGwei: round(clamp(network.gasPriceGwei * (0.95 + Math.random() * 0.1), 0.001, 5), 6),
          updatedAt: new Date(now).toISOString(),
        })),
      },
      { persist: false },
    );
  }

  /** Read block number and gas price from Robinhood Chain RPCs (simulated when RPC is disabled). */
  async refreshNetworks(): Promise<NetworkStatus[]> {
    if (this.state.networks.length === 0) this.seedNetworks();
    if (!this.options.rpc) {
      this.advanceSimulated();
      return this.state.networks;
    }
    if (this.refreshing) return this.state.networks;

    this.refreshing = true;
    try {
      const results = await Promise.allSettled(NETWORK_IDS.map((id) => readNetworkStatus(NETWORKS[id])));
      const updatedAt = nowIso();
      this.setState(
        {
          networks: this.state.networks.map((network) => {
            const result = results[NETWORK_IDS.indexOf(network.id)];
            return result.status === "fulfilled"
              ? { ...network, ...result.value, status: "connected", source: "rpc", updatedAt }
              : { ...network, status: "offline", updatedAt };
          }),
        },
        { persist: false },
      );
    } finally {
      this.refreshing = false;
    }
    return this.state.networks;
  }

  tick(): void {
    void this.refreshNetworks().catch(() => undefined);
  }

  activeStatus(): NetworkStatus | undefined {
    return this.state.networks.find((network) => network.id === ACTIVE_NETWORK.id);
  }

  gasPriceGwei(): number {
    return this.activeStatus()?.gasPriceGwei || RUNTIME_TUNING.fallbackGasPriceGwei;
  }

  estimateFee(gasUnits: number): number {
    return round(gasUnits * this.gasPriceGwei() * 1e-9, 12);
  }

  /** A realistic-looking transaction reference for demo mode. */
  simulateTx(gasUnits: number): TxRef {
    const blockNumber = (this.activeStatus()?.blockNumber ?? SIMULATED_BASE[ACTIVE_NETWORK.id].blockNumber) + randomInt(1, 4);
    return { hash: randomTxHash(), network: ACTIVE_NETWORK.id, blockNumber, fee: this.estimateFee(gasUnits), mode: "demo" };
  }

  recordTransaction(entry: Omit<ChainTransaction, "createdAt">): ChainTransaction {
    const transaction: ChainTransaction = { ...entry, createdAt: nowIso() };
    this.setState({ transactions: [transaction, ...this.state.transactions].slice(0, RUNTIME_TUNING.historyLimit) });
    return transaction;
  }

  /* ------------------------------------------------------------ registry */

  registry(): RegistryDeployment | undefined {
    return this.state.registries[ACTIVE_NETWORK.id];
  }

  requireRegistry(): RegistryDeployment {
    const registry = this.registry();
    if (!registry) {
      throw new Error(`Deploy or import the ZKx8004 registry first (Blockchain tab), or set ${registryEnvName(ACTIVE_NETWORK)}.`);
    }
    return registry;
  }

  private saveRegistry(registry: RegistryDeployment): RegistryDeployment {
    this.setState({ registries: { ...this.state.registries, [registry.network]: registry } });
    return registry;
  }

  async deployRegistry(): Promise<RegistryDeployment> {
    const wallet = this.wallet.requireWallet();
    const live = this.wallet.liveChain();
    let tx: TxRef;
    let address;

    if (live) {
      const summary = await live.deployRegistry();
      if (!summary.contractAddress) throw new Error("The deployment receipt did not include a contract address.");
      tx = liveTxRef(summary, live.network);
      address = summary.contractAddress;
    } else {
      this.payment.assertFunds(wallet.address, { ETH: this.estimateFee(GAS_UNITS.registryDeploy) });
      await this.latency.wait(1100, 2000);
      tx = this.simulateTx(GAS_UNITS.registryDeploy);
      this.payment.debit(wallet.address, { ETH: tx.fee });
      address = randomAddress();
    }

    this.recordTransaction({ kind: "deploy", from: wallet.address, to: address, data: "deploy ZKx8004Registry", value: 0, tx });
    return this.saveRegistry({ address, network: ACTIVE_NETWORK.id, source: "deployed", deployer: wallet.address, tx, deployedAt: nowIso() });
  }

  /** Use an existing registry. With RPC enabled, the address must answer like a ZKx8004 registry. */
  async useRegistry(input: { address: Hex }): Promise<RegistryDeployment> {
    if (this.options.rpc) {
      const code = await publicClientFor(ACTIVE_NETWORK).getCode({ address: input.address });
      if (!code || code === "0x") throw new Error(`No contract is deployed at this address on ${ACTIVE_NETWORK.name}.`);
      await readAnchor(ACTIVE_NETWORK, input.address, zeroHash).catch(() => {
        throw new Error("The contract at this address is not a ZKx8004 registry.");
      });
    }
    return this.saveRegistry({ address: input.address, network: ACTIVE_NETWORK.id, source: "imported", deployedAt: nowIso() });
  }

  /* -------------------------------------------------------- transactions */

  async executeTransaction(input: { to: Hex; data: string; value: number }): Promise<ChainTransaction> {
    const wallet = this.wallet.requireWallet();
    const live = this.wallet.liveChain();
    const calldata: Hex = input.data === "" ? "0x" : isHex(input.data) ? input.data : stringToHex(input.data);
    const gasUnits = calldata === "0x" ? GAS_UNITS.ethTransfer : GAS_UNITS.call;
    let tx: TxRef;

    if (live) {
      tx = liveTxRef(await live.sendTransaction(input.to, calldata, input.value), live.network);
      await this.payment.refreshBalances().catch(() => undefined);
    } else {
      this.payment.assertFunds(wallet.address, { ETH: input.value + this.estimateFee(gasUnits) });
      await this.latency.wait(600, 1300);
      tx = this.simulateTx(gasUnits);
      this.payment.debit(wallet.address, { ETH: input.value + tx.fee });
    }

    return this.recordTransaction({
      kind: input.value > 0 ? "transfer" : "call",
      from: wallet.address,
      to: input.to,
      data: input.data || "(empty)",
      value: input.value,
      tx,
    });
  }
}
