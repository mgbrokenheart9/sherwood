/**
 * Static copy and links for the landing page.
 */

import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { IS_MAINNET, NETWORK_LABEL } from "./deployment";

export const LINKS = {
  github: "https://github.com/polurber/ZKx8004",
  docs: "https://github.com/polurber/ZKx8004#readme",
  x: "https://x.com/zkx8004",
  discord: "https://discord.gg/zkx8004",
  email: "mailto:support@zkx8004.com",
  chainDocs: "https://docs.robinhood.com/chain",
} as const;

export const INSTALL_COMMAND = "npm install viem";

const VIEM_CHAIN = ACTIVE_NETWORK.testnet ? "robinhoodTestnet" : "robinhood";

export const SITE = {
  name: "Sherwood",
  protocol: "ZKx8004",
  title: "Sherwood · Private agents. Zero knowledge.",
  description:
    `Deploy autonomous private agents with zero-knowledge proofs and x402 USDG payments on Robinhood Chain. Prove, pay and transact without exposing strategies, balances or counterparties.${IS_MAINNET ? " Live on Robinhood Chain mainnet." : ""}`,
} as const;

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Console", href: "#console" },
  { label: "How it works", href: "#how-it-works" },
  { label: "GitHub", href: LINKS.github },
] as const;

export const HERO = {
  lines: ["Private agents.", "Zero knowledge."],
  lede: "Deploy autonomous agents that prove, pay and transact on Robinhood Chain through zero-knowledge x402, without exposing strategies, balances or counterparties.",
  platforms: `${NETWORK_LABEL} · x402 · USDG · Zero-knowledge proofs`,
  caption: "Six capabilities. One private runtime.",
} as const;

export type ModuleIcon = "contexts" | "memory" | "actions" | "agents" | "privacy" | "payments";

export const MODULES: { name: string; icon: ModuleIcon; description: string }[] = [
  {
    name: "Composable contexts",
    icon: "contexts",
    description: "Modular contexts composed with the .use() pattern, inspired by Daydreams.",
  },
  {
    name: "Persistent memory",
    icon: "memory",
    description: "Working memory per session plus context memory that persists with TTL support.",
  },
  {
    name: "Type-safe actions",
    icon: "actions",
    description: "Every action is validated by a Zod schema before it runs.",
  },
  {
    name: "Agent deployment",
    icon: "agents",
    description: "Autonomous agents registered in an on-chain registry, with capabilities and limits.",
  },
  {
    name: "Zero-knowledge privacy",
    icon: "privacy",
    description: "Proof commitments anchored on Robinhood Chain and an encrypted private vault.",
  },
  {
    name: "x402 payments",
    icon: "payments",
    description: "USDG micropayments signed as EIP-3009 authorizations and settled by a facilitator.",
  },
];

export const STATEMENT = {
  title: "Privacy is the default, not a setting.",
  lede: "Sherwood is a platform for launching autonomous private agents with built-in zero-knowledge payments on Robinhood Chain, powered by the ZKx8004 protocol. Trading bots, service agents and DeFi automation run without leaking what they know.",
} as const;

export interface FeatureCopy {
  n: string;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  reverse: boolean;
  portrait?: boolean;
}

export const FEATURES: FeatureCopy[] = [
  {
    n: "01",
    kicker: "Privacy",
    title: "Prove everything. Reveal nothing.",
    body: "Generate a proof for any statement, verify it against its commitment and anchor the commitment in the ZKx8004 registry on Robinhood Chain. Private inputs stay sealed in an AES-GCM vault; only hashes go on-chain.",
    points: ["Zero-knowledge proofs", "On-chain anchors", "Encrypted private vault", "Selective disclosure"],
    reverse: false,
  },
  {
    n: "02",
    kicker: "x402 payments",
    title: "Micropayments at machine speed.",
    body: "Agents pay in USDG with x402: the resource answers 402, the wallet signs an EIP-3009 authorization and a facilitator settles it on Robinhood Chain in about a hundred milliseconds. Every step is traced and linked to the explorer.",
    points: ["x402 settlement", "EIP-3009 authorizations", "Private transfers", "Explorer receipts"],
    reverse: true,
  },
  {
    n: "03",
    kicker: "Agents",
    title: "From capability to running agent.",
    body: "Pick capabilities, set resource limits and deploy. Each agent is registered with a commitment of its private configuration, composes the privacy, payment and blockchain contexts through one .use() chain, and records executions on-chain.",
    points: ["Six capabilities", "On-chain registration", "Proof of configuration", "Graceful shutdown"],
    reverse: false,
    portrait: true,
  },
];

export const CONSOLE = {
  eyebrow: "04 · Console",
  title: "The whole runtime, in one console.",
  lede: `Connect an EVM wallet to transact for real on ${ACTIVE_NETWORK.name}, or use the demo wallet to simulate everything locally. Every context writes to persistent memory, so your session is still here when you come back.`,
  meta: [`${NETWORK_LABEL} · chain ${ACTIVE_NETWORK.chainId}`, "Live wallet or demo mode"],
} as const;

export const STEPS = {
  eyebrow: "05 · How it works",
  title: "Four steps to a private agent.",
  intro: "Deploying private autonomous agents has never been this simple. Every step below runs live in the console above.",
  items: [
    {
      label: "01 · Connect wallet",
      title: "Join Robinhood Chain.",
      body: "Connect MetaMask, Rabby or Coinbase Wallet. The console adds Robinhood Chain to your wallet and reads your ETH and USDG balances.",
    },
    {
      label: "02 · Deploy the registry",
      title: "Put commitments on-chain.",
      body: "Deploy the ZKx8004 registry once per network. It anchors proofs, registers agents and records executions by hash.",
      code: "registerAgent(bytes32 agentId, bytes32 configCommitment)",
    },
    {
      label: "03 · Deploy securely",
      title: "Launch with a proof.",
      body: "The agent configuration is committed to a zero-knowledge proof before registration, so the strategy itself stays private.",
    },
    {
      label: "04 · Monitor & scale",
      title: "Watch it work.",
      body: "Track executions, x402 payments and memory in real time, then stop or redeploy with every change linked to the explorer.",
    },
  ],
} as const;

export type UseCaseIcon = "trading" | "service" | "defi" | "payments";

export const USE_CASES = {
  eyebrow: "06 · Use cases",
  title: "Built for autonomous, private money.",
  lede: "Deploy private agents for any on-chain operation. Each one ships with x402 payments and privacy protection on Robinhood Chain.",
  items: [
    {
      icon: "trading" as UseCaseIcon,
      title: "Autonomous trading agents",
      body: "AI agents that execute strategies on tokenized assets with complete privacy and USDG settlement.",
    },
    {
      icon: "service" as UseCaseIcon,
      title: "Private service agents",
      body: "Agents that sell API access per request with x402, paid in USDG without accounts or API keys.",
    },
    {
      icon: "defi" as UseCaseIcon,
      title: "DeFi automation",
      body: "Automate complex DeFi operations with privacy-first agents that handle transactions securely.",
    },
    {
      icon: "payments" as UseCaseIcon,
      title: "Payment processors",
      body: "Autonomous payment processing with EIP-3009 authorizations and ZKx8004 privacy protocols.",
    },
  ],
} as const;

export const QUICK_START = {
  eyebrow: "07 · Quick start",
  title: "Start building.",
  usageLabel: "Pay for an x402 resource with viem",
  usage: `import { createWalletClient, custom, toHex } from 'viem';
import { ${VIEM_CHAIN} } from 'viem/chains';

// 1. The resource answers 402 Payment Required with its price
const offer = await fetch('/api/x402/premium');
const [requirements] = (await offer.json()).accepts;

// 2. Sign an EIP-3009 USDG authorization in the wallet
const wallet = createWalletClient({ chain: ${VIEM_CHAIN}, transport: custom(window.ethereum) });
const [from] = await wallet.requestAddresses();
const authorization = {
  from,
  to: requirements.payTo,
  value: BigInt(requirements.maxAmountRequired),
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 120),
  nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
};
const signature = await wallet.signTypedData({
  account: from,
  domain: { name: 'Global Dollar', version: '1', chainId: ${ACTIVE_NETWORK.chainId}, verifyingContract: requirements.asset },
  types: { TransferWithAuthorization },
  primaryType: 'TransferWithAuthorization',
  message: authorization,
});

// 3. Retry with X-PAYMENT; the facilitator settles on Robinhood Chain
const paid = await fetch('/api/x402/premium', { headers: { 'X-PAYMENT': encodePayment(signature, authorization) } });`,
  meta: `${ACTIVE_NETWORK.name} · chain ${ACTIVE_NETWORK.chainId} · USDG ${ACTIVE_NETWORK.usdg.slice(0, 6)}…`,
} as const;

export const FOOTER_LINKS = [
  { label: "GitHub", href: LINKS.github },
  { label: "X", href: LINKS.x },
  { label: "Discord", href: LINKS.discord },
  { label: "Docs", href: LINKS.docs },
  { label: "Robinhood Chain", href: LINKS.chainDocs },
] as const;

export const isExternal = (href: string): boolean => /^(https?:|mailto:)/.test(href);
