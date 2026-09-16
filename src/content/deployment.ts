/**
 * Network facts shown on the landing page.
 *
 * Sherwood ships as two deployments of the same code: mainnet on the main
 * domain and testnet on a subdomain. The network is chosen at build time and
 * every claim here follows it, so a testnet build never says "mainnet".
 * Mainnet milestones were verified on-chain with `npm run chain:receipts`.
 */

import { ACTIVE_NETWORK, explorerAddress, explorerTx } from "@/lib/chain/config";

export const IS_MAINNET = !ACTIVE_NETWORK.testnet;
export const NETWORK_LABEL = IS_MAINNET ? "Robinhood Chain mainnet" : "Robinhood Chain testnet";

/** Normalises a public site URL to its origin; empty or malformed values are ignored. */
function siteOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return undefined;
  }
}

/** The sibling deployment on the other network, linked only when its URL is configured. */
export const NETWORK_SWITCH = IS_MAINNET
  ? { label: "Testnet", cta: "Try the testnet", note: "Same product · test funds only", url: siteOrigin(process.env.NEXT_PUBLIC_TESTNET_URL) }
  : { label: "Mainnet", cta: "Go to mainnet", note: `Real funds · chain 4663`, url: siteOrigin(process.env.NEXT_PUBLIC_MAINNET_URL) };

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
  linkLabel?: string;
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

function testnetFacts(): DeploymentFact[] {
  const registry = ACTIVE_NETWORK.registry;
  const [faucet] = ACTIVE_NETWORK.faucets;

  return [
    {
      label: "Network",
      value: "Robinhood Chain Testnet",
      note: `Chain ID ${ACTIVE_NETWORK.chainId} · test ETH and USDG have no value`,
      href: ACTIVE_NETWORK.explorerUrl,
    },
    {
      label: "Latest block",
      value: "Live",
      note: "Read from testnet RPC every 4 seconds",
      mono: true,
      live: true,
    },
    registry
      ? {
          label: "Registry contract",
          value: shortHex(registry),
          note: "Testnet registry for proofs and agents",
          href: explorerAddress(ACTIVE_NETWORK, registry),
          mono: true,
        }
      : {
          label: "Registry contract",
          value: "Deploy your own",
          note: "Connect a wallet and deploy it from the console's Blockchain tab",
        },
    {
      label: "Test funds",
      value: "Free faucets",
      note: ACTIVE_NETWORK.faucets.map((item) => item.label.replace(/ faucet/i, "")).join(" · "),
      href: faucet?.url,
      linkLabel: "Open faucet",
    },
  ];
}

export const DEPLOYMENT = IS_MAINNET
  ? {
      eyebrow: `Mainnet · chain ${ACTIVE_NETWORK.chainId}`,
      title: "Live on Robinhood Chain.",
      lede: "Sherwood runs on mainnet today. The registry is deployed and x402 payments settle in USDG on-chain. Every fact below links to the explorer, so you can check it yourself.",
      facts: mainnetFacts(),
    }
  : {
      eyebrow: `Testnet · chain ${ACTIVE_NETWORK.chainId}`,
      title: "Try it on testnet.",
      lede: "This is the Sherwood testnet playground. Everything runs on Robinhood Chain Testnet with test ETH and USDG that have no real value, so you can deploy agents, anchor proofs and send x402 payments freely.",
      facts: testnetFacts(),
    };
