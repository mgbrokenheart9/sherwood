/**
 * Deployment facts shown on the landing page.
 *
 * Mainnet claims only render when the app is built for mainnet, and every
 * value links to the explorer. Milestones were verified on-chain with
 * `npm run chain:receipts`.
 */

import { ACTIVE_NETWORK, explorerAddress, explorerTx } from "@/lib/chain/config";

export const IS_MAINNET = !ACTIVE_NETWORK.testnet;
export const NETWORK_LABEL = IS_MAINNET ? "Robinhood Chain mainnet" : "Robinhood Chain testnet";

const MAINNET_MILESTONES = {
  registry: "0x3c72695fdd4bf09ab378d993832e6d15d628291f",
  firstSettlement: "0xc2efe21d21b71ff077fb5a34287514cba7d16ede24c1b9c9a4092f7c964ba946",
  firstSettlementAmount: "0.01 USDG",
  launchedOn: "Sep 15, 2026",
} as const;

const shortHex = (value: string): string => `${value.slice(0, 6)}…${value.slice(-4)}`;

export interface DeploymentFact {
  label: string;
  value: string;
  note: string;
  href?: string;
  mono?: boolean;
  live?: boolean;
}

function mainnetFacts(): DeploymentFact[] {
  const registry = ACTIVE_NETWORK.registry ?? MAINNET_MILESTONES.registry;
  return [
    {
      label: "Network",
      value: "Robinhood Chain",
      note: `Chain ID ${ACTIVE_NETWORK.chainId} · Arbitrum Orbit L2 · ETH gas`,
      href: ACTIVE_NETWORK.explorerUrl,
    },
    {
      label: "Latest block",
      value: "Live",
      note: "Read from mainnet RPC every 4 seconds",
      mono: true,
      live: true,
    },
    {
      label: "Registry contract",
      value: shortHex(registry),
      note: "Anchors proofs and registers agents",
      href: explorerAddress(ACTIVE_NETWORK, registry),
      mono: true,
    },
    {
      label: "First x402 settlement",
      value: shortHex(MAINNET_MILESTONES.firstSettlement),
      note: `${MAINNET_MILESTONES.firstSettlementAmount} · ${MAINNET_MILESTONES.launchedOn}`,
      href: explorerTx(ACTIVE_NETWORK, MAINNET_MILESTONES.firstSettlement),
      mono: true,
    },
  ];
}

export const DEPLOYMENT = {
  eyebrow: `Mainnet · chain ${ACTIVE_NETWORK.chainId}`,
  title: "Live on Robinhood Chain.",
  lede: "Sherwood runs on mainnet today. The registry is deployed and x402 payments settle in USDG on-chain. Every fact below links to the explorer, so you can check it yourself.",
  facts: IS_MAINNET ? mainnetFacts() : [],
} as const;
