/**
 * HTTP end-to-end checks for the x402 routes of a running server.
 * Uses throwaway keys, so no funds are needed: a correctly signed payment
 * must reach on-chain verification and fail on balance, not on format.
 *
 * Run with: BASE_URL=http://localhost:3000 npm run test:server
 * (the server needs X402_FACILITATOR_PRIVATE_KEY set)
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NETWORKS } from "@/lib/chain/config";
import {
  PAYMENT_HEADER,
  authorizationTypedData,
  createAuthorization,
  encodeHeader,
  paymentRequiredSchema,
  type PaymentPayload,
  type PaymentRequirements,
} from "@/lib/chain/x402";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let passed = 0;

function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`✗ ${label}`);
  passed++;
  console.log(`✓ ${label}`);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function signPayment(requirements: PaymentRequirements, overrides: Partial<PaymentPayload["payload"]["authorization"]> = {}) {
  const payer = privateKeyToAccount(generatePrivateKey());
  const network = NETWORKS[requirements.network];
  const authorization = {
    ...createAuthorization({
      from: payer.address,
      to: requirements.payTo,
      value: BigInt(requirements.maxAmountRequired),
      validForSeconds: requirements.maxTimeoutSeconds,
    }),
    ...overrides,
  };
  const signature = await payer.signTypedData(authorizationTypedData(network, authorization));
  const payment: PaymentPayload = { x402Version: 1, scheme: "exact", network: requirements.network, payload: { signature, authorization } };
  return payment;
}

async function main(): Promise<void> {
  const supported = await json(await fetch(`${BASE_URL}/api/x402/supported`));
  check(supported.facilitatorConfigured === true, `facilitator is configured (payTo ${String(supported.payTo)})`);

  const challenge = await fetch(`${BASE_URL}/api/x402/premium`);
  check(challenge.status === 402, "premium resource answers 402 Payment Required");
  const offer = paymentRequiredSchema.parse(await challenge.json());
  const [requirements] = offer.accepts;
  check(
    requirements.scheme === "exact" && requirements.asset === NETWORKS[requirements.network].usdg && requirements.extra.name === "Global Dollar",
    `requirements ask for ${requirements.maxAmountRequired} USDG base units on ${requirements.network}`,
  );

  const malformed = await fetch(`${BASE_URL}/api/x402/premium`, { headers: { [PAYMENT_HEADER]: "not-base64!" } });
  const malformedBody = await json(malformed);
  check(malformed.status === 402 && malformedBody.error === "malformed_payment_header", "malformed X-PAYMENT header is rejected");

  const unfunded = await signPayment(requirements);
  const paid = await fetch(`${BASE_URL}/api/x402/premium`, { headers: { [PAYMENT_HEADER]: encodeHeader(unfunded) } });
  const paidBody = await json(paid);
  check(paid.status === 402 && paidBody.error === "insufficient_funds", "valid signature from an unfunded payer fails on-chain balance check");

  const underpaid = await signPayment(requirements, { value: "1" });
  const underpaidBody = await json(await fetch(`${BASE_URL}/api/x402/premium`, { headers: { [PAYMENT_HEADER]: encodeHeader(underpaid) } }));
  check(underpaidBody.error === "invalid_signature" || underpaidBody.error === "insufficient_amount", `tampered amount is rejected (${String(underpaidBody.error)})`);

  const verify = await json(
    await fetch(`${BASE_URL}/api/x402/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload: unfunded, paymentRequirements: requirements }),
    }),
  );
  check(verify.isValid === false && verify.invalidReason === "insufficient_funds", "POST /verify reads nonce and balance on-chain");

  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const foreignRequirements = { ...requirements, payTo: stranger };
  const foreignPayment = await signPayment(foreignRequirements);
  const settle = await json(
    await fetch(`${BASE_URL}/api/x402/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload: foreignPayment, paymentRequirements: foreignRequirements }),
    }),
  );
  check(settle.success === false && settle.errorReason === "pay_to_not_accepted", "POST /settle refuses payments to other merchants");

  const invalid = await fetch(`${BASE_URL}/api/x402/verify`, { method: "POST", body: "{}" });
  check(invalid.status === 400, "POST /verify rejects invalid bodies with 400");

  console.log(`\nAll ${passed} server x402 checks passed against ${BASE_URL}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
