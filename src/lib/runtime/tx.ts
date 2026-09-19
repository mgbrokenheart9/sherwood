import type { NetworkConfig } from "@/lib/chain/config";
import type { TxSummary } from "@/lib/chain/live";
import type { TxRef } from "./types";

export function liveTxRef(summary: TxSummary, network: NetworkConfig): TxRef {
  return {
    hash: summary.hash,
    network: network.id,
    blockNumber: summary.blockNumber,
    fee: summary.fee,
    mode: "live",
    explorerUrl: summary.explorerUrl,
    confirmationMs: summary.confirmationMs,
  };
}

/** Finds the first explorer link in an action result, for the activity log. */
export function findExplorerUrl(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > 3) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.explorerUrl === "string") return record.explorerUrl;
  for (const key of ["tx", "payment", "anchor", "registration"]) {
    const found = findExplorerUrl(record[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}
