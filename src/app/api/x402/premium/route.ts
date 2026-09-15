/**
 * Premium resource protected by x402. Answers 402 with payment requirements,
 * then verifies and settles the USDG authorization before returning data.
 */

import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { facilitatorAccount, merchantAddress, premiumPriceUsdg, settlePayment, verifyPayment } from "@/lib/chain/facilitator";
import { readNetworkStatus } from "@/lib/chain/live";
import {
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  createRequirements,
  decodeHeader,
  encodeHeader,
  paymentPayloadSchema,
  toUsdgUnits,
} from "@/lib/chain/x402";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const payTo = merchantAddress();
  if (!payTo || !facilitatorAccount()) {
    return Response.json(
      { x402Version: X402_VERSION, error: "facilitator_not_configured", accepts: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requirements = createRequirements({
    network: ACTIVE_NETWORK,
    payTo,
    amount: toUsdgUnits(premiumPriceUsdg()),
    resource: request.url,
    description: "Sherwood private agent signal feed",
  });

  const paymentRequired = (error: string) =>
    Response.json({ x402Version: X402_VERSION, error, accepts: [requirements] }, { status: 402, headers: { "Cache-Control": "no-store" } });

  const header = request.headers.get(PAYMENT_HEADER);
  if (!header) return paymentRequired("X-PAYMENT header is required");

  let decoded: unknown;
  try {
    decoded = decodeHeader(header);
  } catch {
    return paymentRequired("malformed_payment_header");
  }

  const payment = paymentPayloadSchema.safeParse(decoded);
  if (!payment.success) return paymentRequired("invalid_payment_payload");

  const verification = await verifyPayment(payment.data, requirements);
  if (!verification.isValid) return paymentRequired(verification.invalidReason ?? "invalid_payment");

  const settlement = await settlePayment(payment.data, requirements);
  if (!settlement.success) return paymentRequired(settlement.errorReason ?? "settlement_failed");

  const status = await readNetworkStatus(ACTIVE_NETWORK).catch(() => null);

  return Response.json(
    {
      resource: "zkx8004-signal-feed",
      issuedAt: new Date().toISOString(),
      payer: settlement.payer,
      transaction: settlement.transaction,
      network: ACTIVE_NETWORK.id,
      signal: status
        ? { blockNumber: status.blockNumber, gasPriceGwei: status.gasPriceGwei, congestion: status.gasPriceGwei > 0.05 ? "elevated" : "normal" }
        : null,
    },
    {
      headers: {
        [PAYMENT_RESPONSE_HEADER]: encodeHeader(settlement),
        "Access-Control-Expose-Headers": PAYMENT_RESPONSE_HEADER,
        "Cache-Control": "no-store",
      },
    },
  );
}
