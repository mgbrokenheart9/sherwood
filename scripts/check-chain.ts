/**
 * Live, read-only checks against Robinhood Chain using the app's network
 * config: RPC reachability, USDG metadata, the EIP-712 domain used by
 * EIP-3009 authorizations, and that transferWithAuthorization is callable.
 *
 * Run with: npm run chain:check
 */

import { domainSeparator, parseAbi, zeroAddress, zeroHash } from "viem";
import { USDG_ABI, USDG_DECIMALS, USDG_DOMAIN } from "@/lib/chain/abi";
import { NETWORKS, NETWORK_IDS } from "@/lib/chain/config";
import { describeChainError, publicClientFor, readNetworkStatus } from "@/lib/chain/live";

const DOMAIN_SEPARATOR_ABI = parseAbi(["function DOMAIN_SEPARATOR() view returns (bytes32)"]);

let failures = 0;

function report(ok: boolean, label: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}

async function main(): Promise<void> {
  for (const id of NETWORK_IDS) {
    const network = NETWORKS[id];
    const client = publicClientFor(network);
    console.log(`\n== ${network.name} (${network.chainId})`);

    try {
      const status = await readNetworkStatus(network);
      report(true, `RPC reachable · block ${status.blockNumber} · ${status.gasPriceGwei} gwei · ${status.latencyMs} ms`);

      const [name, symbol, decimals, separator] = await Promise.all([
        client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "name" }),
        client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "symbol" }),
        client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "decimals" }),
        client.readContract({ address: network.usdg, abi: DOMAIN_SEPARATOR_ABI, functionName: "DOMAIN_SEPARATOR" }),
      ]);
      report(symbol === "USDG" && decimals === USDG_DECIMALS, `USDG at ${network.usdg}: ${name} (${symbol}), ${decimals} decimals`);

      const expected = domainSeparator({ domain: { ...USDG_DOMAIN, chainId: network.chainId, verifyingContract: network.usdg } });
      report(expected === separator, `EIP-712 domain "${USDG_DOMAIN.name}" v${USDG_DOMAIN.version} matches DOMAIN_SEPARATOR`);

      try {
        await client.simulateContract({
          address: network.usdg,
          abi: USDG_ABI,
          functionName: "transferWithAuthorization",
          args: [zeroAddress, zeroAddress, 0n, 0n, 0n, zeroHash, 27, zeroHash, zeroHash],
          account: zeroAddress,
        });
        report(false, "transferWithAuthorization should reject an empty signature");
      } catch (error) {
        report(true, `transferWithAuthorization exists (rejects empty signature: ${describeChainError(error)})`);
      }

      if (network.registry) {
        const code = await client.getCode({ address: network.registry });
        report(Boolean(code && code !== "0x"), `Configured registry ${network.registry} has bytecode`);
      }
    } catch (error) {
      report(false, `Network check failed: ${describeChainError(error)}`);
    }
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nRobinhood Chain checks passed.");
}

void main();
