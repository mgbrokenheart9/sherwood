/**
 * ZKx8004 runtime: composes every context, routes actions through the
 * type-safe executor and exposes an external store for React.
 */

import { shorten } from "@/lib/format";
import { ACTION_META, ActionExecutor, type ActionInput, type ActionName, type HandlerMap } from "./actions";
import { RUNTIME_TUNING } from "./catalog";
import { AgentDeploymentContext, type AgentsState } from "./contexts/agents";
import type { BaseContext, ContextDeps, RuntimeOptions } from "./contexts/base";
import { BlockchainContext, type BlockchainState } from "./contexts/blockchain";
import { PaymentContext, type PaymentState } from "./contexts/payment";
import { PrivacyContext, type PrivacyState } from "./contexts/privacy";
import { WalletContext, type WalletState } from "./contexts/wallet";
import { createId, randomHex } from "./crypto";
import { MemoryManager, type MemoryStats } from "./memory";
import { findExplorerUrl } from "./tx";
import type { ActivityEvent, ContextId, ProofVerification, RuntimeMode } from "./types";
import { Latency, errorMessage, nowIso } from "./utils";

interface RuntimeContexts {
  wallet: WalletContext;
  privacy: PrivacyContext;
  payment: PaymentContext;
  blockchain: BlockchainContext;
  agents: AgentDeploymentContext;
  reset: () => Promise<{ reset: true }>;
}

function createHandlers(ctx: RuntimeContexts) {
  return {
    connectWallet: async (input) => {
      const wallet = await ctx.wallet.connect(input);
      await ctx.payment.refreshBalances().catch(() => undefined);
      return wallet;
    },
    disconnectWallet: () => ctx.wallet.disconnect(),
    requestAirdrop: (input) => ctx.payment.airdrop(input),
    refreshBalances: () => ctx.payment.refreshBalances(),
    generateZKProof: (input) => ctx.privacy.generateProof(input),
    verifyProof: (input) => ctx.privacy.verifyProof(input),
    anchorProof: (input) => ctx.privacy.anchorProof(input),
    storePrivateData: (input) => ctx.privacy.storePrivateData(input),
    retrievePrivateData: (input) => ctx.privacy.retrievePrivateData(input),
    deletePrivateData: (input) => ctx.privacy.deletePrivateData(input),
    estimateFees: async (input) => ctx.payment.estimateFees(input),
    processPayment: (input) => ctx.payment.processPayment(input),
    purchasePremium: () => ctx.payment.purchasePremium(),
    refreshNetworks: () => ctx.blockchain.refreshNetworks(),
    deployRegistry: () => ctx.blockchain.deployRegistry(),
    useRegistry: (input) => ctx.blockchain.useRegistry(input),
    executeTransaction: (input) => ctx.blockchain.executeTransaction(input),
    deployAgent: (input) => ctx.agents.deployAgent(input),
    agentCommand: (input) => ctx.agents.runCommand(input),
    stopAgent: (input) => ctx.agents.stopAgent(input),
    removeAgent: (input) => ctx.agents.removeAgent(input),
    resetRuntime: () => ctx.reset(),
  } satisfies HandlerMap;
}

type RuntimeHandlers = ReturnType<typeof createHandlers>;
export type ActionOutput<N extends ActionName> = Awaited<ReturnType<RuntimeHandlers[N]>>;

const MESSAGES: { [N in ActionName]: (output: ActionOutput<N>) => string } = {
  connectWallet: (wallet) => `Connected ${wallet.walletName} ${shorten(wallet.address, 6, 4)}`,
  disconnectWallet: () => "Wallet disconnected",
  requestAirdrop: (drop) => `Airdropped ${drop.amount} ${drop.currency}`,
  refreshBalances: () => "Balances refreshed",
  generateZKProof: (proof) => `Generated ${proof.circuit} proof ${shorten(proof.proof, 8, 4)}`,
  verifyProof: (result) => (result.verified ? "Proof verified" : `Proof rejected: ${result.reason}`),
  anchorProof: (proof) => `Anchored proof ${shorten(proof.proof, 8, 4)} in block ${proof.anchor?.blockNumber.toLocaleString("en-US")}`,
  storePrivateData: (record) => `Sealed "${record.key}" ${record.encrypted ? "with AES-GCM" : "as plaintext"}`,
  retrievePrivateData: (record) => `Opened "${record.key}"`,
  deletePrivateData: (record) => `Deleted "${record.key}"`,
  estimateFees: (estimate) => `Estimated ${estimate.total} ETH`,
  processPayment: (payment) =>
    `Sent ${payment.amount} ${payment.currency} to ${shorten(payment.recipient, 6, 4)}${payment.method === "x402" ? " via x402" : ""}`,
  purchasePremium: (purchase) => `Bought the premium feed for ${purchase.payment.amount} USDG via x402`,
  refreshNetworks: (networks) => `Refreshed ${networks.length} networks`,
  deployRegistry: (registry) => `Deployed ZKx8004Registry at ${shorten(registry.address, 6, 4)}`,
  useRegistry: (registry) => `Using registry ${shorten(registry.address, 6, 4)}`,
  executeTransaction: (entry) => `Confirmed ${entry.kind} ${shorten(entry.tx.hash, 6, 4)}`,
  deployAgent: (agent) => `Deployed agent ${agent.name}${agent.registration ? " and registered it on-chain" : ""}`,
  agentCommand: (execution) => `${execution.agentName} ran ${execution.command}`,
  stopAgent: (agent) => `Stopped agent ${agent.name}`,
  removeAgent: (removed) => `Removed agent ${removed.name}`,
  resetRuntime: () => "Runtime reset",
};

export interface RuntimeSnapshot {
  hydrated: boolean;
  mode: RuntimeMode;
  wallet: WalletState;
  privacy: PrivacyState;
  payment: PaymentState;
  blockchain: BlockchainState;
  agents: AgentsState;
  activity: ActivityEvent[];
  memory: MemoryStats;
}

const EMPTY_MEMORY: MemoryStats = {
  sessionId: "",
  workingKeys: 0,
  activeContexts: [],
  lastActivity: "",
  contexts: [],
  totalBytes: 0,
};

export interface ZKRuntimeOptions extends Partial<RuntimeOptions> {
  latencyScale?: number;
}

export class ZKRuntime {
  readonly memory: MemoryManager;
  readonly wallet: WalletContext;
  readonly privacy: PrivacyContext;
  readonly payment: PaymentContext;
  readonly blockchain: BlockchainContext;
  readonly agents: AgentDeploymentContext;

  private readonly executor: ActionExecutor<RuntimeHandlers>;
  private readonly listeners = new Set<() => void>();
  private readonly contexts: BaseContext[];
  private readonly options: RuntimeOptions;
  private readonly serverSnapshot: RuntimeSnapshot;
  private snapshot: RuntimeSnapshot;
  private activity: ActivityEvent[] = [];
  private hydrated = false;

  constructor({ latencyScale = 1, rpc = true, apiBase = "" }: ZKRuntimeOptions = {}) {
    this.memory = new MemoryManager(`session_${randomHex(6)}`);
    this.options = { rpc, apiBase };

    const deps: ContextDeps = {
      memory: this.memory,
      latency: new Latency(latencyScale),
      options: this.options,
      notify: () => this.emit(),
    };
    this.wallet = new WalletContext(deps);
    this.privacy = new PrivacyContext(deps);
    this.payment = new PaymentContext(deps);
    this.blockchain = new BlockchainContext(deps);
    this.agents = new AgentDeploymentContext(deps);

    this.privacy.use(this.wallet).use(this.blockchain).use(this.payment);
    this.payment.use(this.wallet).use(this.privacy).use(this.blockchain);
    this.blockchain.use(this.wallet).use(this.payment);
    this.agents.use(this.wallet).use(this.privacy).use(this.payment).use(this.blockchain);
    this.contexts = [this.wallet, this.privacy, this.payment, this.blockchain, this.agents];

    this.executor = new ActionExecutor(
      createHandlers({
        wallet: this.wallet,
        privacy: this.privacy,
        payment: this.payment,
        blockchain: this.blockchain,
        agents: this.agents,
        reset: () => this.reset(),
      }),
    );

    this.snapshot = this.buildSnapshot();
    this.serverSnapshot = this.snapshot;
  }

  /* --------------------------------------------------------- external store */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RuntimeSnapshot => this.snapshot;

  getServerSnapshot = (): RuntimeSnapshot => this.serverSnapshot;

  private buildSnapshot(): RuntimeSnapshot {
    return {
      hydrated: this.hydrated,
      mode: this.wallet.mode,
      wallet: this.wallet.snapshot,
      privacy: this.privacy.snapshot,
      payment: this.payment.snapshot,
      blockchain: this.blockchain.snapshot,
      agents: this.agents.snapshot,
      activity: this.activity,
      memory: this.hydrated ? this.memory.stats() : EMPTY_MEMORY,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  /* -------------------------------------------------------------- lifecycle */

  /** Load persisted state, restore the wallet and read the chain. Client-only. */
  hydrate(): void {
    this.memory.activate("runtime");
    this.contexts.forEach((context) => context.hydrate());
    this.activity = this.memory.get<ActivityEvent[]>("runtime", "activity") ?? [];
    this.hydrated = true;
    this.emit();

    if (typeof window !== "undefined") {
      void this.wallet
        .restore()
        .then(() => (this.wallet.mode === "live" ? this.payment.refreshBalances() : undefined))
        .catch(() => undefined);
    }
    void this.blockchain.refreshNetworks().catch(() => undefined);
  }

  /** Re-read storage, e.g. when another tab changed the runtime. */
  rehydrate(): void {
    this.memory.invalidate();
    this.hydrate();
  }

  private async reset(): Promise<{ reset: true }> {
    this.memory.clear();
    this.contexts.forEach((context) => context.reset());
    this.activity = [];
    this.emit();
    return { reset: true };
  }

  /* ---------------------------------------------------------------- actions */

  async execute<N extends ActionName>(name: N, input: ActionInput<N>): Promise<ActionOutput<N>> {
    const { context, log } = ACTION_META[name];

    try {
      const output = await this.executor.execute(name, input);
      if (log) {
        // A rejected proof is a valid outcome, but it should read as a failure in the log.
        const rejected = name === "verifyProof" && !(output as ProofVerification).verified;
        this.log(context, name, MESSAGES[name](output), rejected ? "error" : "success", findExplorerUrl(output));
      }
      return output;
    } catch (error) {
      if (log) this.log(context, name, errorMessage(error), "error");
      throw error;
    }
  }

  private log(context: ContextId, action: ActionName, message: string, status: ActivityEvent["status"], explorerUrl?: string): void {
    const event: ActivityEvent = { id: createId("evt"), context, action, message, status, explorerUrl, at: nowIso() };
    this.activity = [event, ...this.activity].slice(0, RUNTIME_TUNING.activityLimit);
    this.memory.set("runtime", "activity", this.activity);
    this.emit();
  }
}
