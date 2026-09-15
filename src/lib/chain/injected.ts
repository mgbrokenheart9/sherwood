/**
 * Injected EVM wallets: EIP-6963 discovery with a window.ethereum fallback,
 * plus helpers to put the wallet on Robinhood Chain.
 */

import { getAddress, numberToHex, type Address, type EIP1193Provider } from "viem";
import type { NetworkConfig } from "./config";

export interface InjectedWallet {
  id: string;
  name: string;
  icon?: string;
  provider: EIP1193Provider;
}

interface ProviderAnnouncement {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<ProviderAnnouncement>;
  }
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const UNRECOGNIZED_CHAIN = 4902;

export function discoverInjectedWallets(timeoutMs = 350): Promise<InjectedWallet[]> {
  if (typeof window === "undefined") return Promise.resolve([]);

  return new Promise((resolve) => {
    const wallets = new Map<string, InjectedWallet>();

    const onAnnounce = (event: CustomEvent<ProviderAnnouncement>) => {
      const { info, provider } = event.detail;
      const id = info.rdns || info.uuid;
      wallets.set(id, { id, name: info.name, icon: info.icon, provider });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      if (wallets.size === 0 && window.ethereum) {
        wallets.set("injected", { id: "injected", name: "Browser wallet", provider: window.ethereum });
      }
      resolve(Array.from(wallets.values()));
    }, timeoutMs);
  });
}

export async function requestAccounts(provider: EIP1193Provider): Promise<Address[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return accounts.map((account) => getAddress(account));
}

/** Accounts already authorised for this site; never prompts. */
export async function authorizedAccounts(provider: EIP1193Provider): Promise<Address[]> {
  const accounts = await provider.request({ method: "eth_accounts" });
  return accounts.map((account) => getAddress(account));
}

export async function walletChainId(provider: EIP1193Provider): Promise<number> {
  return Number.parseInt(await provider.request({ method: "eth_chainId" }), 16);
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, data } = error as { code?: number; data?: { originalError?: { code?: number } } };
  return data?.originalError?.code ?? code;
}

export async function switchToNetwork(provider: EIP1193Provider, network: NetworkConfig): Promise<void> {
  const chainId = numberToHex(network.chainId);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if (errorCode(error) !== UNRECOGNIZED_CHAIN) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: network.name,
          nativeCurrency: network.chain.nativeCurrency,
          rpcUrls: network.rpcUrls,
          blockExplorerUrls: [network.explorerUrl],
        },
      ],
    });
  }
}

export function describeWalletError(error: unknown): string {
  const code = errorCode(error);
  if (code === 4001) return "Request rejected in the wallet.";
  if (code === -32002) return "A wallet request is already pending. Open your wallet to continue.";
  if (error instanceof Error) return error.message.split("\n")[0];
  return "Wallet request failed.";
}
