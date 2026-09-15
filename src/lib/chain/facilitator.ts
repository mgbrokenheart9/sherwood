/**
 * Self-hosted x402 facilitator for Robinhood Chain (server-side only).
 *
 * Settlement broadcasts USDG `transferWithAuthorization` from a relayer key
 * that pays gas. The relayer only settles payments to the configured merchant,
 * so it cannot be used as an open gas faucet.
 *
 * Environment:
 * - X402_FACILITATOR_PRIVATE_KEY  relayer key (holds ETH for gas, never USDG)
 * - X402_PAY_TO                   merchant address (defaults to the relayer address)
 * - X402_PRICE_USDG               price of the premium resource (default 0.01)
 */

import {
  createWalletClient,
  fallback,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDG_ABI } from "./abi";
import { ACTIVE_NETWORK, NETWORKS } from "./config";
import { describeChainError, publicClientFor } from "./live";
import {
  X402_VERSION,
  verifyAuthorizationOffline,
  type PaymentPayload,
  type PaymentRequirements,
  type SettlementResponse,
  type VerifyResponse,
} from "./x402";

export function facilitatorAccount() {
  const key = process.env.X402_FACILITATOR_PRIVATE_KEY;
  return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? privateKeyToAccount(key as Hex) : undefined;
}

export function merchantAddress(): Address | undefined {
  const payTo = process.env.X402_PAY_TO;
  if (payTo && isAddress(payTo)) return getAddress(payTo);
  return facilitatorAccount()?.address;
}

export function premiumPriceUsdg(): string {
  const price = process.env.X402_PRICE_USDG;
  return price && /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0 ? price : "0.01";
}

export function supportedKinds() {
  return {
    kinds: [{ x402Version: X402_VERSION, scheme: "exact" as const, network: ACTIVE_NETWORK.id }],
    network: { id: ACTIVE_NETWORK.id, chainId: ACTIVE_NETWORK.chainId, caip2: ACTIVE_NETWORK.caip2, asset: ACTIVE_NETWORK.usdg },
    facilitatorConfigured: Boolean(facilitatorAccount()),
    payTo: merchantAddress() ?? null,
    priceUsdg: premiumPriceUsdg(),
  };
}

export async function verifyPayment(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
  const offline = await verifyAuthorizationOffline(payment, requirements);
  if (!offline.isValid) return offline;

  const network = NETWORKS[requirements.network];
  const client = publicClientFor(network);
  const { from, value, nonce } = payment.payload.authorization;

  try {
    const [nonceUsed, balance] = await Promise.all([
      client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "authorizationState", args: [from, nonce] }),
      client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "balanceOf", args: [from] }),
    ]);
    if (nonceUsed) return { isValid: false, invalidReason: "nonce_already_used", payer: from };
    if (balance < BigInt(value)) return { isValid: false, invalidReason: "insufficient_funds", payer: from };
  } catch (error) {
    return { isValid: false, invalidReason: `rpc_unavailable: ${describeChainError(error)}`, payer: from };
  }

  return offline;
}

export async function settlePayment(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementResponse> {
  const network = NETWORKS[requirements.network];
  const account = facilitatorAccount();
  const merchant = merchantAddress();
  const payer = payment.payload.authorization.from;

  if (!account) return { success: false, network: network.id, payer, errorReason: "facilitator_not_configured" };
  if (!merchant || !isAddressEqual(merchant, requirements.payTo)) {
    return { success: false, network: network.id, payer, errorReason: "pay_to_not_accepted" };
  }

  const verification = await verifyPayment(payment, requirements);
  if (!verification.isValid) return { success: false, network: network.id, payer, errorReason: verification.invalidReason };

  const { authorization, signature } = payment.payload;
  const { r, s, v, yParity } = parseSignature(signature);
  const wallet = createWalletClient({
    account,
    chain: network.chain,
    transport: fallback(network.rpcUrls.map((url) => http(url, { timeout: 10_000 }))),
  });

  try {
    const hash = await wallet.writeContract({
      address: network.usdg,
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
    });
    const receipt = await publicClientFor(network).waitForTransactionReceipt({ hash, timeout: 60_000 });
    return receipt.status === "success"
      ? { success: true, network: network.id, payer, transaction: hash }
      : { success: false, network: network.id, payer, transaction: hash, errorReason: "transaction_reverted" };
  } catch (error) {
    return { success: false, network: network.id, payer, errorReason: `settlement_failed: ${describeChainError(error)}` };
  }
}
