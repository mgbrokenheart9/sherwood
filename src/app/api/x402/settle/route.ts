import { z } from "zod";
import { settlePayment } from "@/lib/chain/facilitator";
import { paymentPayloadSchema, paymentRequirementsSchema } from "@/lib/chain/x402";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ success: false, errorReason: "invalid_request" }, { status: 400 });
  }
  return Response.json(await settlePayment(parsed.data.paymentPayload, parsed.data.paymentRequirements));
}
