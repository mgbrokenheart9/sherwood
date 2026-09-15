/**
 * Static runtime catalogues: capabilities, circuits and tunables.
 */

import type { Address } from "viem";
import type { Capability, CapabilityId, CircuitId, FeePriority, ResourceLimits } from "./types";

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "zk-proof-generation",
    name: "ZK proof generation",
    description: "Generate zero-knowledge proofs for privacy verification",
    requiresPrivacy: true,
    requiresPayment: false,
  },
  {
    id: "payment-processing",
    name: "Payment processing",
    description: "Settle USDG micropayments via x402 authorizations",
    requiresPrivacy: false,
    requiresPayment: true,
  },
  {
    id: "contract-interaction",
    name: "Contract interaction",
    description: "Record executions in the ZKx8004 registry or call contracts",
    requiresPrivacy: false,
    requiresPayment: false,
  },
  {
    id: "private-data-analysis",
    name: "Private data analysis",
    description: "Analyse sensitive data while maintaining privacy",
    requiresPrivacy: true,
    requiresPayment: false,
  },
  {
    id: "multi-party-computation",
    name: "Multi-party computation",
    description: "Compute across parties without revealing their inputs",
    requiresPrivacy: true,
    requiresPayment: true,
  },
  {
    id: "autonomous-trading",
    name: "Autonomous trading",
    description: "Execute trading strategies with privacy preservation",
    requiresPrivacy: true,
    requiresPayment: true,
  },
];

export const CAPABILITY_IDS = CAPABILITIES.map((capability) => capability.id) as [CapabilityId, ...CapabilityId[]];

export function getCapability(id: CapabilityId): Capability {
  const capability = CAPABILITIES.find((item) => item.id === id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  return capability;
}

/** Parameters each capability accepts when an agent runs it as a command. */
export const CAPABILITY_PARAMETERS: Record<CapabilityId, { name: string; label: string; placeholder: string }[]> = {
  "zk-proof-generation": [
    { name: "statement", label: "Statement", placeholder: "balance >= 100 USDG" },
    { name: "data", label: "Private data", placeholder: "wallet balance snapshot" },
  ],
  "payment-processing": [
    { name: "amount", label: "Amount (USDG)", placeholder: "1.5" },
    { name: "recipient", label: "Recipient", placeholder: "0x…" },
  ],
  "contract-interaction": [
    { name: "contract", label: "Contract (optional)", placeholder: "Registry by default" },
    { name: "method", label: "Method", placeholder: "rebalance" },
  ],
  "private-data-analysis": [
    { name: "data", label: "Dataset", placeholder: "42, 17, 88, 51" },
    { name: "analysisType", label: "Analysis", placeholder: "summary" },
  ],
  "multi-party-computation": [
    { name: "computation", label: "Computation", placeholder: "sum" },
    { name: "parties", label: "Party inputs", placeholder: "alice:12, bob:30, carol:7" },
  ],
  "autonomous-trading": [
    { name: "strategy", label: "Strategy", placeholder: "mean-reversion" },
    { name: "assets", label: "Assets", placeholder: "ETH, USDG" },
  ],
};

export const CIRCUITS: readonly { id: CircuitId; label: string }[] = [
  { id: "balance-threshold", label: "Balance threshold" },
  { id: "identity-attestation", label: "Identity attestation" },
  { id: "payment-range", label: "Payment range" },
  { id: "agent-config", label: "Agent configuration" },
  { id: "custom", label: "Custom circuit" },
];

export const CIRCUIT_IDS = CIRCUITS.map((circuit) => circuit.id) as [CircuitId, ...CircuitId[]];

export const MEMORY_LIMITS: ResourceLimits["maxMemory"][] = ["256MB", "512MB", "1GB", "2GB"];
export const EXECUTION_LIMITS: ResourceLimits["maxExecutionTime"][] = ["10s", "30s", "60s", "120s"];

export const PRIORITY_GAS_MULTIPLIER: Record<FeePriority, number> = { low: 1, medium: 1.2, high: 1.5 };
export const PRIORITY_ETA: Record<FeePriority, string> = { low: "~2s", medium: "~1s", high: "<1s" };

export const GAS_UNITS = {
  ethTransfer: 21_000,
  tokenTransfer: 65_000,
  authorization: 95_000,
  registryDeploy: 650_000,
  registryWrite: 110_000,
  call: 50_000,
} as const;

export const RUNTIME_TUNING = {
  /** Demo-mode starting balances for a new wallet. */
  startingBalances: { ETH: 0.5, USDG: 1000 },
  airdrop: { ETH: 0.25, USDG: 250 },
  /** Gas price used when no RPC reading is available. */
  fallbackGasPriceGwei: 0.01,
  agentDeploymentFeeUsdg: 0.5,
  capabilityFeeUsdg: { "multi-party-computation": 0.1, "autonomous-trading": 0.25 } as Partial<Record<CapabilityId, number>>,
  /** Where simulated fees go in demo mode. Live fees require NEXT_PUBLIC_TREASURY_ADDRESS. */
  demoTreasury: "0x000000000000000000000000000000000000fEE5" as Address,
  activityLimit: 60,
  historyLimit: 50,
} as const;
