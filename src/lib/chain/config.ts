/**
 * Robinhood Chain network configuration.
 *
 * Values were verified live: chain IDs via eth_chainId, USDG metadata and the
 * EIP-712 domain via the token contract. Public RPCs come first because the
 * robinhood.com endpoints are blocked on some networks.
 */

import { defineChain, getAddress, isAddress, type Address, type Chain, type Hash } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

export type NetworkId = "robinhood-mainnet" | "robinhood-testnet";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  caip2: `eip155:${number}`;
  testnet: boolean;
  rpcUrls: string[];
  explorerUrl: string;
  usdg: Address;
  registry?: Address;
  faucets: { label: string; url: string }[];
  chain: Chain;
}

function optionalAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? getAddress(value) : undefined;
}

/**
 * Both Robinhood Chain networks land blocks in about 100 ms. viem states this for
 * mainnet but not for testnet, where it would otherwise assume a 12 s Ethereum block
 * and poll for receipts every 4 s — making a 100 ms chain feel forty times slower.
 */
export const BLOCK_TIME_MS = 100;

function withRpcs(base: Chain, rpcUrls: string[]): Chain {
  return defineChain({ ...base, blockTime: base.blockTime ?? BLOCK_TIME_MS, rpcUrls: { default: { http: rpcUrls } } });
}

const MAINNET_RPCS = [
  "https://robinhood-rpc.publicnode.com",
  "https://rpc.mainnet.chain.robinhood.com",
  "https://rpc.nodeflare.app/robinhood/public",
];

const TESTNET_RPCS = [
  "https://robinhood-sepolia-rpc.publicnode.com",
  "https://rpc.testnet.chain.robinhood.com",
  "https://robinhood-testnet.drpc.org",
];

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  "robinhood-mainnet": {
    id: "robinhood-mainnet",
    name: "Robinhood Chain",
    chainId: robinhood.id,
    caip2: `eip155:${robinhood.id}`,
    testnet: false,
    rpcUrls: MAINNET_RPCS,
    explorerUrl: "https://robinhoodchain.blockscout.com",
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    registry: optionalAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_MAINNET),
    faucets: [],
    chain: withRpcs(robinhood, MAINNET_RPCS),
  },
  "robinhood-testnet": {
    id: "robinhood-testnet",
    name: "Robinhood Chain Testnet",
    chainId: robinhoodTestnet.id,
    caip2: `eip155:${robinhoodTestnet.id}`,
    testnet: true,
    rpcUrls: TESTNET_RPCS,
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F",
    registry: optionalAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET),
    faucets: [
      { label: "Chainlink faucet (ETH)", url: "https://faucets.chain.link/robinhood-testnet" },
      { label: "QuickNode faucet (ETH)", url: "https://faucet.quicknode.com/robinhood/testnet" },
      { label: "Official faucet", url: "https://faucet.testnet.chain.robinhood.com" },
      { label: "Paxos faucet (USDG)", url: "https://faucet.paxos.com" },
    ],
    chain: withRpcs(robinhoodTestnet, TESTNET_RPCS),
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as [NetworkId, ...NetworkId[]];

/** Network used by the app. Defaults to mainnet (real funds); set NEXT_PUBLIC_ROBINHOOD_NETWORK=testnet for development. */
export const ACTIVE_NETWORK_ID: NetworkId =
  process.env.NEXT_PUBLIC_ROBINHOOD_NETWORK === "testnet" ? "robinhood-testnet" : "robinhood-mainnet";

export const ACTIVE_NETWORK = NETWORKS[ACTIVE_NETWORK_ID];

/** Name of the env var that pins a pre-deployed registry for a network. */
export const registryEnvName = (network: NetworkConfig): string =>
  `NEXT_PUBLIC_REGISTRY_ADDRESS_${network.testnet ? "TESTNET" : "MAINNET"}`;

/** Receives protocol fees (agent deployment, paid capabilities) in live mode. Fees are skipped when unset. */
export const TREASURY_ADDRESS = optionalAddress(process.env.NEXT_PUBLIC_TREASURY_ADDRESS);

export function networkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((network) => network.chainId === chainId);
}

export const explorerTx = (network: NetworkConfig, hash: Hash | string): string => `${network.explorerUrl}/tx/${hash}`;

export const explorerAddress = (network: NetworkConfig, address: Address | string): string =>
  `${network.explorerUrl}/address/${address}`;
