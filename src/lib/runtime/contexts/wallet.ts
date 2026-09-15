/**
 * Wallet Context: connects an injected EVM wallet (MetaMask, Rabby, Coinbase
 * Wallet, … via EIP-6963) on Robinhood Chain, or a local demo signer.
 */

import { getAddress, type Address } from "viem";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import {
  authorizedAccounts,
  describeWalletError,
  discoverInjectedWallets,
  requestAccounts,
  switchToNetwork,
  walletChainId,
  type InjectedWallet,
} from "@/lib/chain/injected";
import { LiveChain } from "@/lib/chain/live";
import { randomAddress } from "../crypto";
import type { RuntimeMode, Wallet, WalletProvider } from "../types";
import { nowIso } from "../utils";
import { BaseContext } from "./base";

export interface WalletState {
  wallet: Wallet | null;
  /** Demo address is kept so reconnecting restores the same simulated balances. */
  demoAddress: Address | null;
}

export class WalletContext extends BaseContext<WalletState> {
  readonly id = "wallet";
  readonly name = "Wallet Context";
  readonly description = "Connects an EVM wallet or a demo signer on Robinhood Chain";

  private live: LiveChain | null = null;
  private detach?: () => void;

  protected initialState(): WalletState {
    return { wallet: null, demoAddress: null };
  }

  get mode(): RuntimeMode {
    return this.live ? "live" : "demo";
  }

  liveChain(): LiveChain | null {
    return this.live;
  }

  requireWallet(): Wallet {
    if (!this.state.wallet) throw new Error("Connect a wallet first.");
    return this.state.wallet;
  }

  async connect(input: { provider: WalletProvider; walletId?: string }): Promise<Wallet> {
    if (input.provider === "demo") {
      this.release();
      await this.latency.wait(250, 600);
      const address = this.state.demoAddress ?? randomAddress();
      const wallet: Wallet = {
        address,
        provider: "demo",
        walletName: "Demo wallet",
        chainId: ACTIVE_NETWORK.chainId,
        connectedAt: nowIso(),
      };
      this.setState({ wallet, demoAddress: address });
      return wallet;
    }

    const wallets = await discoverInjectedWallets();
    const target = wallets.find((wallet) => wallet.id === input.walletId) ?? wallets[0];
    if (!target) {
      throw new Error("No EVM wallet detected. Install MetaMask, Rabby or Coinbase Wallet, or use the demo wallet.");
    }

    try {
      const [address] = await requestAccounts(target.provider);
      if (!address) throw new Error("The wallet did not share an account.");
      await switchToNetwork(target.provider, ACTIVE_NETWORK);
      return await this.attach(target, address);
    } catch (error) {
      throw new Error(describeWalletError(error));
    }
  }

  /** Reconnect a previously authorised injected wallet after a reload, without prompting. */
  async restore(): Promise<void> {
    const saved = this.state.wallet;
    if (!saved || saved.provider !== "injected" || this.live) return;

    const wallets = await discoverInjectedWallets();
    const target = wallets.find((wallet) => wallet.id === saved.walletId) ?? wallets[0];
    const accounts = target ? await authorizedAccounts(target.provider).catch(() => []) : [];

    if (!target || accounts.length === 0) {
      this.setState({ wallet: null });
      return;
    }
    await this.attach(target, accounts.find((account) => account === saved.address) ?? accounts[0]);
  }

  private async attach(target: InjectedWallet, address: Address): Promise<Wallet> {
    this.release();
    this.live = new LiveChain(ACTIVE_NETWORK, { type: "eip1193", provider: target.provider, address });

    const wallet: Wallet = {
      address,
      provider: "injected",
      walletName: target.name,
      walletId: target.id,
      chainId: await walletChainId(target.provider).catch(() => ACTIVE_NETWORK.chainId),
      connectedAt: nowIso(),
    };
    this.setState({ wallet });

    const onAccountsChanged = (accounts: Address[]) => {
      const [next] = accounts;
      if (!next) {
        this.release();
        this.setState({ wallet: null });
      } else if (getAddress(next) !== this.state.wallet?.address) {
        void this.attach(target, getAddress(next));
      }
    };
    const onChainChanged = (chainId: string) => {
      const current = this.state.wallet;
      if (current) this.setState({ wallet: { ...current, chainId: Number.parseInt(chainId, 16) } });
    };

    target.provider.on("accountsChanged", onAccountsChanged);
    target.provider.on("chainChanged", onChainChanged);
    this.detach = () => {
      target.provider.removeListener("accountsChanged", onAccountsChanged);
      target.provider.removeListener("chainChanged", onChainChanged);
    };

    return wallet;
  }

  private release(): void {
    this.detach?.();
    this.detach = undefined;
    this.live = null;
  }

  async disconnect(): Promise<{ disconnected: true }> {
    this.release();
    this.setState({ wallet: null });
    return { disconnected: true };
  }

  override reset(): void {
    this.release();
    super.reset();
  }
}
