/**
 * Shared domain types for the ZKx8004 runtime on Robinhood Chain.
 * Every value is JSON-serialisable so context state can be persisted as-is.
 */

import type { Address, Hex } from "viem";
import type { NetworkId } from "@/lib/chain/config";

export type { NetworkId };

export type ContextId = "wallet" | "privacy" | "payment" | "blockchain" | "agents" | "runtime";

/** `live` signs real transactions with an injected wallet; `demo` simulates them locally. */
export type RuntimeMode = "demo" | "live";

export type Currency = "ETH" | "USDG";
export type FeePriority = "low" | "medium" | "high";
export type CommandPriority = "low" | "normal" | "high";
export type PaymentMethod = "x402" | "transfer";

export type CircuitId =
  | "balance-threshold"
  | "identity-attestation"
  | "payment-range"
  | "agent-config"
  | "custom";

export type CapabilityId =
  | "zk-proof-generation"
  | "payment-processing"
  | "contract-interaction"
  | "private-data-analysis"
  | "multi-party-computation"
  | "autonomous-trading";

/** Reference to a confirmed (or simulated) transaction. */
export interface TxRef {
  hash: Hex;
  network: NetworkId;
  blockNumber: number;
  /** Fee paid in ETH. */
  fee: number;
  mode: RuntimeMode;
  explorerUrl?: string;
}

/* ------------------------------------------------------------------ wallet */

export type WalletProvider = "injected" | "demo";

export interface Wallet {
  address: Address;
  provider: WalletProvider;
  walletName: string;
  walletId?: string;
  chainId: number;
  connectedAt: string;
}

/* ----------------------------------------------------------------- privacy */

export interface SealedPayload {
  iv: string;
  ciphertext: string;
}

export interface ProofAnchor extends TxRef {
  registry: Address;
}

export interface ZKProof {
  id: string;
  circuit: CircuitId;
  statement: string;
  proof: string;
  /** SHA-256 commitment, usable on-chain as bytes32. */
  verificationKey: string;
  nullifier: string;
  publicInputs: string[];
  witness: SealedPayload;
  verified: boolean | null;
  verifiedAt?: string;
  anchor?: ProofAnchor;
  createdAt: string;
}

export interface VaultRecord {
  key: string;
  encrypted: boolean;
  iv?: string;
  payload: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProofVerification {
  proofId?: string;
  verified: boolean;
  anchored?: boolean;
  reason: string;
  checkedAt: string;
}

/* ----------------------------------------------------------------- payment */

export type Balances = Record<Currency, number>;

export interface FeeEstimate {
  gasUnits: number;
  gasPriceGwei: number;
  /** Total fee in ETH. */
  total: number;
  currency: "ETH";
  priority: FeePriority;
  estimatedTime: string;
}

export interface TraceStep {
  label: string;
  offsetMs: number;
}

export interface Payment {
  id: string;
  amount: number;
  currency: Currency;
  sender: Address;
  recipient: Address;
  memo?: string;
  priority: FeePriority;
  private: boolean;
  proofId?: string;
  method: PaymentMethod;
  settledBy: "wallet" | "facilitator" | "simulator";
  resource?: string;
  tx: TxRef;
  trace: TraceStep[];
  createdAt: string;
}

/* -------------------------------------------------------------- blockchain */

export interface NetworkStatus {
  id: NetworkId;
  name: string;
  chainId: number;
  status: "connected" | "offline";
  source: "rpc" | "simulated";
  blockNumber: number;
  gasPriceGwei: number;
  latencyMs: number;
  updatedAt: string;
}

export interface RegistryDeployment {
  address: Address;
  network: NetworkId;
  source: "deployed" | "configured" | "imported";
  deployer?: Address;
  tx?: TxRef;
  deployedAt: string;
}

export interface ChainTransaction {
  kind: "deploy" | "call" | "transfer" | "authorization" | "anchor" | "register" | "status" | "execution";
  from: Address;
  to?: Address;
  data: string;
  value: number;
  tx: TxRef;
  createdAt: string;
}

/* ------------------------------------------------------------------ agents */

export interface Capability {
  id: CapabilityId;
  name: string;
  description: string;
  requiresPrivacy: boolean;
  requiresPayment: boolean;
}

export interface ResourceLimits {
  maxMemory: "256MB" | "512MB" | "1GB" | "2GB";
  maxExecutionTime: "10s" | "30s" | "60s" | "120s";
  maxRequests: number;
}

export interface Agent {
  id: string;
  /** keccak256 of the agent id, used as bytes32 in the registry. */
  onChainId: Hex;
  name: string;
  owner: Address;
  capabilities: CapabilityId[];
  privacy: boolean;
  paymentRequired: boolean;
  status: "running" | "stopped";
  endpoint: string;
  configProofId?: string;
  feePaymentId?: string;
  registration?: TxRef;
  resourceLimits: ResourceLimits;
  security: {
    encryptedCommunication: boolean;
    zeroKnowledgeProofs: boolean;
    auditEnabled: boolean;
  };
  requests: number;
  createdAt: string;
  stoppedAt?: string;
}

export interface Execution {
  id: string;
  agentId: string;
  agentName: string;
  command: CapabilityId;
  parameters: Record<string, string>;
  priority: CommandPriority;
  status: "completed" | "failed";
  output: string;
  durationMs: number;
  tx?: TxRef;
  startedAt: string;
}

/* ----------------------------------------------------------------- runtime */

export interface ActivityEvent {
  id: string;
  context: ContextId;
  action: string;
  message: string;
  status: "success" | "error";
  explorerUrl?: string;
  at: string;
}
