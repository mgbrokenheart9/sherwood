/**
 * Read-only receipt checks on the active Robinhood Chain network.
 *
 *   npm run chain:receipts -- <txHash> [<txHash> ...] [--code <address>]
 */

import "./lib/load-env";
import { formatEther, formatUnits, isAddress, isHex, parseEventLogs, type Address, type Hash } from "viem";
import { USDG_ABI, USDG_DECIMALS } from "@/lib/chain/abi";
import { ACTIVE_NETWORK, explorerTx } from "@/lib/chain/config";
import { describeChainError, publicClientFor } from "@/lib/chain/live";

const client = publicClientFor(ACTIVE_NETWORK);
const args = process.argv.slice(2);
const codeIndex = args.indexOf("--code");
const codeAddress = codeIndex >= 0 ? args[codeIndex + 1] : undefined;
const hashes = args.filter((arg, index) => isHex(arg) && arg.length === 66 && index !== codeIndex + 1) as Hash[];

async function main(): Promise<void> {
  if (hashes.length === 0 && !codeAddress) {
    console.error("Usage: npm run chain:receipts -- <txHash> [...] [--code <address>]");
    process.exit(1);
  }

  let failures = 0;
  let totalFees = 0n;
  console.log(`${ACTIVE_NETWORK.name} (chain ${ACTIVE_NETWORK.chainId})`);

  for (const hash of hashes) {
    try {
      const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
      const fee = receipt.gasUsed * receipt.effectiveGasPrice;
      totalFees += fee;
      if (receipt.status !== "success") failures++;

      console.log(
        `${receipt.status === "success" ? "✓" : "✗"} ${hash.slice(0, 12)}… block ${receipt.blockNumber} · ${tx.from} → ${receipt.contractAddress ?? tx.to} · value ${formatEther(tx.value)} ETH · fee ${formatEther(fee)} ETH`,
      );
      for (const log of parseEventLogs({ abi: USDG_ABI, eventName: "Transfer", logs: receipt.logs })) {
        if (log.address.toLowerCase() === ACTIVE_NETWORK.usdg.toLowerCase()) {
          console.log(`    USDG ${log.args.from} → ${log.args.to}: ${formatUnits(log.args.value, USDG_DECIMALS)}`);
        }
      }
      console.log(`    ${explorerTx(ACTIVE_NETWORK, hash)}`);
    } catch (error) {
      failures++;
      console.log(`✗ ${hash.slice(0, 12)}… ${describeChainError(error)}`);
    }
  }

  if (codeAddress) {
    if (!isAddress(codeAddress)) {
      failures++;
      console.log(`✗ ${codeAddress} is not an address`);
    } else {
      const code = await client.getCode({ address: codeAddress as Address });
      const present = Boolean(code && code !== "0x");
      if (!present) failures++;
      console.log(`${present ? "✓" : "✗"} contract ${codeAddress} ${present ? `has ${(code!.length - 2) / 2} bytes of code` : "has no code"}`);
    }
  }

  if (hashes.length > 0) console.log(`Total fees: ${formatEther(totalFees)} ETH`);
  process.exit(failures ? 1 : 0);
}

void main();
