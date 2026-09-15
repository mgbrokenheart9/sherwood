/**
 * x402 "exact" payments on Robinhood Chain, settled with USDG EIP-3009
 * `transferWithAuthorization`. Isomorphic: safe for browser, server and scripts.
 *
 * Flow: the resource server answers 402 with payment requirements, the client
 * signs an authorization and retries with an `X-PAYMENT` header, the server
 * verifies and settles, then returns the resource with `X-PAYMENT-RESPONSE`.
 */

import { getAddress, isAddressEqual, parseUnits, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";
import { z } from "zod";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, USDG_DECIMALS, USDG_DOMAIN } from "./abi";
import { NETWORKS, NETWORK_IDS, type NetworkConfig, type NetworkId } from "./config";

export const X402_VERSION = 1;
export const PAYMENT_HEADER = "X-PAYMENT";
export const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

/** Seconds of clock skew tolerated when checking validity windows. */
const CLOCK_SKEW_SECONDS = 6;

export interface PaymentRequirements {
  scheme: "exact";
  network: NetworkId;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: { name: string; version: string; caip2: string; decimals: number };
}

export interface TransferAuthorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface PaymentPayload {
  x402Version: typeof X402_VERSION;
  scheme: "exact";
  network: NetworkId;
  payload: { signature: Hex; authorization: TransferAuthorization };
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: Address;
}

export interface SettlementResponse {
  success: boolean;
  network: NetworkId;
  transaction?: Hex;
  payer?: Address;
  errorReason?: string;
}

/* ------------------------------------------------------------------ schemas */

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid address")
  .transform((value) => getAddress(value));
const hex = (bytes: number) => z.string().regex(new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`), `Expected ${bytes} bytes of hex`) as z.ZodType<Hex>;
const uint = z.string().regex(/^\d+$/, "Expected an unsigned integer string");

export const paymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.enum(NETWORK_IDS),
  maxAmountRequired: uint,
  resource: z.string(),
  description: z.string(),
  mimeType: z.string(),
  payTo: address,
  maxTimeoutSeconds: z.number().int().positive(),
  asset: address,
  extra: z.object({ name: z.string(), version: z.string(), caip2: z.string(), decimals: z.number().int() }),
});

export const paymentPayloadSchema = z.object({
  x402Version: z.literal(X402_VERSION),
  scheme: z.literal("exact"),
  network: z.enum(NETWORK_IDS),
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte signature") as z.ZodType<Hex>,
    authorization: z.object({
      from: address,
      to: address,
      value: uint,
      validAfter: uint,
      validBefore: uint,
      nonce: hex(32),
    }),
  }),
});

export const paymentRequiredSchema = z.object({
  x402Version: z.number(),
  error: z.string().optional(),
  accepts: z.array(paymentRequirementsSchema),
});

/* ------------------------------------------------------------------ helpers */

export const toUsdgUnits = (amount: number | string): bigint =>
  parseUnits(typeof amount === "number" ? amount.toFixed(USDG_DECIMALS) : amount, USDG_DECIMALS);

export function createRequirements(options: {
  network: NetworkConfig;
  payTo: Address;
  amount: bigint;
  resource: string;
  description: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}): PaymentRequirements {
  return {
    scheme: "exact",
    network: options.network.id,
    maxAmountRequired: options.amount.toString(),
    resource: options.resource,
    description: options.description,
    mimeType: options.mimeType ?? "application/json",
    payTo: options.payTo,
    maxTimeoutSeconds: options.maxTimeoutSeconds ?? 120,
    asset: options.network.usdg,
    extra: { ...USDG_DOMAIN, caip2: options.network.caip2, decimals: USDG_DECIMALS },
  };
}

export function createNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function createAuthorization(options: {
  from: Address;
  to: Address;
  value: bigint;
  validForSeconds: number;
  now?: number;
}): TransferAuthorization {
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  return {
    from: options.from,
    to: options.to,
    value: options.value.toString(),
    validAfter: String(nowSeconds - 60),
    validBefore: String(nowSeconds + options.validForSeconds),
    nonce: createNonce(),
  };
}

export function authorizationTypedData(network: NetworkConfig, authorization: TransferAuthorization) {
  return {
    domain: { ...USDG_DOMAIN, chainId: network.chainId, verifyingContract: network.usdg },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  };
}

export function encodeHeader(value: PaymentPayload | SettlementResponse): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function decodeHeader(value: string): unknown {
  const binary = atob(value);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
}

/**
 * Checks everything that does not need the chain: fields, amounts, validity
 * window and the EIP-712 signature. On-chain checks live in the facilitator.
 */
export async function verifyAuthorizationOffline(
  payment: PaymentPayload,
  requirements: PaymentRequirements,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifyResponse> {
  const { authorization, signature } = payment.payload;
  const payer = authorization.from;
  const invalid = (invalidReason: string): VerifyResponse => ({ isValid: false, invalidReason, payer });

  if (payment.scheme !== requirements.scheme) return invalid("unsupported_scheme");
  if (payment.network !== requirements.network) return invalid("network_mismatch");

  const network = NETWORKS[requirements.network];
  if (!isAddressEqual(requirements.asset, network.usdg)) return invalid("asset_mismatch");
  if (!isAddressEqual(authorization.to, requirements.payTo)) return invalid("pay_to_mismatch");
  if (BigInt(authorization.value) < BigInt(requirements.maxAmountRequired)) return invalid("insufficient_amount");

  const validAfter = Number(authorization.validAfter);
  const validBefore = Number(authorization.validBefore);
  if (validAfter > nowSeconds + CLOCK_SKEW_SECONDS) return invalid("authorization_not_yet_valid");
  if (validBefore <= nowSeconds + CLOCK_SKEW_SECONDS) return invalid("authorization_expired");
  if (validBefore - nowSeconds > requirements.maxTimeoutSeconds + 60) return invalid("authorization_window_too_long");

  try {
    const signer = await recoverTypedDataAddress({ ...authorizationTypedData(network, authorization), signature });
    if (!isAddressEqual(signer, authorization.from)) return invalid("invalid_signature");
  } catch {
    return invalid("invalid_signature");
  }

  return { isValid: true, payer };
}
