/**
 * Live Robinhood Chain access through viem: read-only clients with RPC
 * fallback, network status, and a signer-bound `LiveChain` for transactions.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseSignature,
  parseUnits,
  type Account,
  type Address,
  type EIP1193Provider,
  type Hash,
  type Hex,
} from "viem";
import { USDG_ABI, USDG_DECIMALS } from "./abi";
import { explorerTx, type NetworkConfig } from "./config";
import { describeWalletCode, describeWalletError, switchToNetwork, walletChainId } from "./injected";
import { REGISTRY_ABI, REGISTRY_BYTECODE } from "./registry-artifact";
import { authorizationTypedData, type TransferAuthorization } from "./x402";

const RPC_TIMEOUT_MS = 10_000;
const RECEIPT_TIMEOUT_MS = 120_000;

const rpcTransport = (network: NetworkConfig) =>
  fallback(network.rpcUrls.map((url) => http(url, { timeout: RPC_TIMEOUT_MS })));

function createChainClient(network: NetworkConfig) {
  return createPublicClient({ chain: network.chain, transport: rpcTransport(network) });
}

type ChainPublicClient = ReturnType<typeof createChainClient>;
const publicClients = new Map<number, ChainPublicClient>();

export function publicClientFor(network: NetworkConfig): ChainPublicClient {
  let client = publicClients.get(network.chainId);
  if (!client) {
    client = createChainClient(network);
    publicClients.set(network.chainId, client);
  }
  return client;
}

export interface LiveNetworkStatus {
  chainId: number;
  blockNumber: number;
  gasPriceGwei: number;
  latencyMs: number;
}

export async function readNetworkStatus(network: NetworkConfig): Promise<LiveNetworkStatus> {
  const started = performance.now();
  const client = publicClientFor(network);
  const [chainId, blockNumber, gasPrice] = await Promise.all([client.getChainId(), client.getBlockNumber(), client.getGasPrice()]);
  if (chainId !== network.chainId) throw new Error(`RPC answered for chain ${chainId}, expected ${network.chainId}.`);

  return {
    chainId,
    blockNumber: Number(blockNumber),
    gasPriceGwei: Number(formatUnits(gasPrice, 9)),
    latencyMs: Math.round(performance.now() - started),
  };
}

export async function readBalances(network: NetworkConfig, address: Address): Promise<{ ETH: number; USDG: number }> {
  const client = publicClientFor(network);
  const [eth, usdg] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "balanceOf", args: [address] }),
  ]);
  return { ETH: Number(formatEther(eth)), USDG: Number(formatUnits(usdg, USDG_DECIMALS)) };
}

export async function readAnchor(network: NetworkConfig, registry: Address, commitment: Hex) {
  const [owner, anchoredAt, nullifier] = await publicClientFor(network).readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "getAnchor",
    args: [commitment],
  });
  return { owner, anchoredAt: Number(anchoredAt), nullifier };
}

/** Human-readable message for reverts, rejections and RPC failures. */
export function describeChainError(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return `Contract reverted: ${revert.data?.errorName ?? revert.reason ?? "unknown reason"}`;
    }
    // Rejections and queued prompts reach us wrapped in a viem error, whose own wording
    // ("Requested resource not available.") does not say what the person should do next.
    const wallet = describeWalletCode(error.walk((cause) => describeWalletCode(cause) !== undefined));
    if (wallet) return wallet;
    return error.shortMessage;
  }
  return describeWalletError(error);
}

export type ChainSigner =
  | { type: "eip1193"; provider: EIP1193Provider; address: Address }
  | { type: "local"; account: Account };

export interface TxSummary {
  hash: Hash;
  from: Address;
  to?: Address;
  blockNumber: number;
  fee: number;
  contractAddress?: Address;
  explorerUrl: string;
}

export class LiveChain {
  readonly address: Address;
  private readonly client: ChainPublicClient;
  private readonly wallet;
  private readonly account: Address | Account;

  constructor(
    readonly network: NetworkConfig,
    private readonly signer: ChainSigner,
  ) {
    this.client = publicClientFor(network);
    this.account = signer.type === "eip1193" ? signer.address : signer.account;
    this.address = signer.type === "eip1193" ? signer.address : signer.account.address;
    this.wallet = createWalletClient({
      account: this.account,
      chain: network.chain,
      transport: signer.type === "eip1193" ? custom(signer.provider) : rpcTransport(network),
    });
  }

  private async ensureNetwork(): Promise<void> {
    if (this.signer.type !== "eip1193") return;
    if ((await walletChainId(this.signer.provider)) !== this.network.chainId) {
      await switchToNetwork(this.signer.provider, this.network);
    }
  }

  private async run(send: () => Promise<Hash>): Promise<TxSummary> {
    try {
      await this.ensureNetwork();
      const hash = await send();
      const receipt = await this.client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      const explorerUrl = explorerTx(this.network, hash);
      if (receipt.status !== "success") throw new Error(`Transaction reverted. See ${explorerUrl}`);

      return {
        hash,
        from: receipt.from,
        to: receipt.to ?? undefined,
        blockNumber: Number(receipt.blockNumber),
        fee: Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)),
        contractAddress: receipt.contractAddress ?? undefined,
        explorerUrl,
      };
    } catch (error) {
      throw new Error(describeChainError(error));
    }
  }

  balances(): Promise<{ ETH: number; USDG: number }> {
    return readBalances(this.network, this.address);
  }

  transferEth(to: Address, amount: number): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.sendTransaction({ account: this.account, chain: this.network.chain, to, value: parseEther(amount.toFixed(18)) }),
    );
  }

  transferUsdg(to: Address, amount: number): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: this.network.usdg,
        abi: USDG_ABI,
        functionName: "transfer",
        args: [to, parseUnits(amount.toFixed(USDG_DECIMALS), USDG_DECIMALS)],
      }),
    );
  }

  sendTransaction(to: Address, data: Hex, valueEth: number): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.sendTransaction({
        account: this.account,
        chain: this.network.chain,
        to,
        data,
        value: parseEther(valueEth.toFixed(18)),
      }),
    );
  }

  async signAuthorization(authorization: TransferAuthorization): Promise<Hex> {
    try {
      await this.ensureNetwork();
      return await this.wallet.signTypedData({ account: this.account, ...authorizationTypedData(this.network, authorization) });
    } catch (error) {
      throw new Error(describeChainError(error));
    }
  }

  /** Settle an EIP-3009 authorization from this wallet (payer pays gas). */
  submitAuthorization(authorization: TransferAuthorization, signature: Hex): Promise<TxSummary> {
    const { r, s, v, yParity } = parseSignature(signature);
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: this.network.usdg,
        abi: USDG_ABI,
        functionName: "transferWithAuthorization",
        args: [
          authorization.from,
          authorization.to,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce,
          Number(v ?? BigInt(yParity + 27)),
          r,
          s,
        ],
      }),
    );
  }

  deployRegistry(): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.deployContract({ account: this.account, chain: this.network.chain, abi: REGISTRY_ABI, bytecode: REGISTRY_BYTECODE }),
    );
  }

  anchorProof(registry: Address, commitment: Hex, nullifier: Hex, circuit: string): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "anchorProof",
        args: [commitment, nullifier, circuit],
      }),
    );
  }

  registerAgent(registry: Address, agentId: Hex, configCommitment: Hex): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "registerAgent",
        args: [agentId, configCommitment],
      }),
    );
  }

  setAgentActive(registry: Address, agentId: Hex, active: boolean): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "setAgentActive",
        args: [agentId, active],
      }),
    );
  }

  recordExecution(registry: Address, agentId: Hex, capability: Hex, resultHash: Hex): Promise<TxSummary> {
    return this.run(() =>
      this.wallet.writeContract({
        account: this.account,
        chain: this.network.chain,
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "recordExecution",
        args: [agentId, capability, resultHash],
      }),
    );
  }
}
