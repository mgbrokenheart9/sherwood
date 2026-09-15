/**
 * Verifies an X-PAYMENT header offline with the app's verifier and prints the result as JSON.
 * Used by the Python SDK parity tests, and handy when debugging an x402 client written in another language.
 *
 * echo '{"header":"<base64>","requirements":{...},"now":1760000000}' | npx tsx scripts/verify-payment-header.ts
 */

import { z } from "zod";
import { decodeHeader, paymentPayloadSchema, paymentRequirementsSchema, verifyAuthorizationOffline } from "@/lib/chain/x402";

const inputSchema = z.object({
  header: z.string(),
  requirements: paymentRequirementsSchema,
  now: z.number().int().positive().optional(),
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const input = inputSchema.parse(JSON.parse(await readStdin()));

  let decoded: unknown;
  try {
    decoded = decodeHeader(input.header);
  } catch {
    console.log(JSON.stringify({ isValid: false, invalidReason: "malformed_payment_header" }));
    return;
  }

  const payment = paymentPayloadSchema.safeParse(decoded);
  if (!payment.success) {
    console.log(JSON.stringify({ isValid: false, invalidReason: "invalid_payment_payload" }));
    return;
  }

  console.log(JSON.stringify(await verifyAuthorizationOffline(payment.data, input.requirements, input.now)));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
