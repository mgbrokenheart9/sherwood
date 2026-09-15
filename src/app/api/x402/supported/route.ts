import { supportedKinds } from "@/lib/chain/facilitator";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(supportedKinds(), { headers: { "Cache-Control": "no-store" } });
}
