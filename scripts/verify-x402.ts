/**
 * Verifies the x402 / EIP-3009 implementation for Robinhood Chain.
 *
 * Offline: header encoding, field checks and signature recovery.
 * On-chain (testnet, read-only): a correctly signed authorization from an
 * unfunded key must fail for a different reason than a forged signature,
 * proving the USDG contract accepts our EIP-712 signatures.
 *
 * Run with: npm test
 */

import "./lib/load-env";
import { BaseError, ContractFunctionRevertedError, parseSignature, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { USDG_ABI } from "@/lib/chain/abi";
import { ACTIVE_NETWORK, NETWORK_IDS } from "@/lib/chain/config";
import { verifyPayment } from "@/lib/chain/facilitator";
import { publicClientFor } from "@/lib/chain/live";
import {
  authorizationTypedData,
  createAuthorization,
  createRequirements,
  decodeHeader,
  encodeHeader,
  paymentPayloadSchema,
  toUsdgUnits,
  verifyAuthorizationOffline,
  type PaymentPayload,
  type TransferAuthorization,
} from "@/lib/chain/x402";

let passed = 0;

function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`✗ ${label}`);
  passed++;
  console.log(`✓ ${label}`);
}

const network = ACTIVE_NETWORK;
const otherNetworkId = NETWORK_IDS.find((id) => id !== network.id) ?? network.id;

async function sign(account: ReturnType<typeof privateKeyToAccount>, authorization: TransferAuthorization): Promise<Hex> {
  return account.signTypedData(authorizationTypedData(network, authorization));
}

function revertSignature(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.signature ?? revert.data?.errorName ?? revert.reason ?? "unknown";
    }
    return error.shortMessage;
  }
  return String(error);
}

async function simulateSettlement(authorization: TransferAuthorization, signature: Hex): Promise<string> {
  const { r, s, v, yParity } = parseSignature(signature);
  try {
    await publicClientFor(network).simulateContract({
      address: network.usdg,
      abi: USDG_ABI,
      functionName: "transferWithAuthorization",
      account: authorization.to,
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
    return "no revert";
  } catch (error) {
    return revertSignature(error);
  }
}

async function main(): Promise<void> {
  const payer = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const merchant = privateKeyToAccount(generatePrivateKey()).address;

  const requirements = createRequirements({
    network,
    payTo: merchant,
    amount: toUsdgUnits("0.01"),
    resource: "https://zkx8004.test/api/x402/premium",
    description: "verification",
  });
  check(requirements.maxAmountRequired === "10000", "0.01 USDG is 10000 base units");

  const authorization = createAuthorization({ from: payer.address, to: merchant, value: BigInt(requirements.maxAmountRequired), validForSeconds: 120 });
  const signature = await sign(payer, authorization);
  const payment: PaymentPayload = { x402Version: 1, scheme: "exact", network: network.id, payload: { signature, authorization } };

  /* offline */
  const roundTrip = paymentPayloadSchema.parse(decodeHeader(encodeHeader(payment)));
  check(JSON.stringify(roundTrip) === JSON.stringify(payment), "X-PAYMENT header round-trips");
  check((await verifyAuthorizationOffline(payment, requirements)).isValid, "valid authorization passes offline verification");

  const expect = async (mutated: PaymentPayload, reason: string, label: string, now?: number) => {
    const result = await verifyAuthorizationOffline(mutated, requirements, now);
    check(!result.isValid && result.invalidReason === reason, `${label} → ${result.invalidReason}`);
  };

  const withAuth = (patch: Partial<TransferAuthorization>, sig = signature): PaymentPayload => ({
    ...payment,
    payload: { signature: sig, authorization: { ...authorization, ...patch } },
  });

  await expect(withAuth({ value: "9999" }), "insufficient_amount", "underpayment is rejected");
  await expect(withAuth({ value: "20000" }), "invalid_signature", "altered amount breaks the signature");
  await expect(withAuth({ to: stranger.address }), "pay_to_mismatch", "wrong recipient is rejected");
  await expect({ ...payment, network: otherNetworkId }, "network_mismatch", "wrong network is rejected");
  await expect(payment, "authorization_expired", "expired authorization is rejected", Number(authorization.validBefore) + 10);
  await expect(withAuth({}, await sign(stranger, authorization)), "invalid_signature", "signature from another key is rejected");

  /* on-chain, read-only */
  const forged = await sign(stranger, authorization);
  const [validRevert, forgedRevert] = await Promise.all([
    simulateSettlement(authorization, signature),
    simulateSettlement(authorization, forged),
  ]);
  console.log(`  valid signature, unfunded payer → ${validRevert}`);
  console.log(`  forged signature                → ${forgedRevert}`);
  check(validRevert !== forgedRevert, `USDG on ${network.name} accepts our EIP-712 signature (fails later on balance)`);

  const facilitatorCheck = await verifyPayment(payment, requirements);
  check(!facilitatorCheck.isValid && facilitatorCheck.invalidReason === "insufficient_funds", "facilitator reads nonce and balance on-chain");

  console.log(`\nAll ${passed} x402 checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
