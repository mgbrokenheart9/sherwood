/**
 * Cross-language test vectors.
 *
 * Fixed inputs are hashed, committed and signed with the app's own code (viem, src/lib/chain/x402.ts and the
 * privacy context helpers) and written to test/vectors/x402-vectors.json. Foundry (test/X402Vectors.t.sol) and
 * the Python SDK (sdk/python/tests/test_vectors.py) must reproduce every value, so the three cannot drift apart.
 *
 * Run with: npm run vectors         rewrite the file
 *           npm run vectors:check   exit 1 when the file is stale (CI)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { concat, encodeAbiParameters, hashTypedData, keccak256, parseSignature, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDG_DOMAIN } from "@/lib/chain/abi";
import { NETWORKS } from "@/lib/chain/config";
import {
  authorizationTypedData,
  createRequirements,
  encodeHeader,
  type PaymentPayload,
  type SettlementResponse,
  type TransferAuthorization,
} from "@/lib/chain/x402";
import { canonical, commitmentPreimage, nullifierPreimage } from "@/lib/runtime/contexts/privacy";
import { sha256Hex } from "@/lib/runtime/crypto";

const OUTPUT = path.join(process.cwd(), "test", "vectors", "x402-vectors.json");

/** Anvil's first default account. A public test key: never fund it on a real network. */
const TEST_PRIVATE_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MERCHANT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const NOW = 1_760_000_000;
const network = NETWORKS["robinhood-mainnet"];

const typeHash = (type: string): Hex => keccak256(stringToHex(type));

async function buildVectors() {
  /* agent ids and commitments, as in src/lib/runtime/contexts/agents.ts */
  const runtimeId = "agent_mfq3k2x1a9b8c7";
  const capability = "contract_interaction";
  const resultInput = `${runtimeId}|${capability}|${NOW * 1000}`;
  const capabilities = ["payment_processing", "contract_interaction"];
  const deploymentOptions = { maxMemory: "512MB", maxExecutionTime: "300s", maxRequests: 1000, limits: { "10": "ten", "2": "two", burst: 5 } };
  const configJson = JSON.stringify({ capabilities, deploymentOptions });

  /* proofs, as in src/lib/runtime/contexts/privacy.ts. Names exercise trimming, case, punctuation and integer keys. */
  const circuit = "balance-threshold";
  const inputs = {
    threshold: "1000",
    Balance: "25000",
    asset: "USDG",
    Asset: "Global Dollar",
    "max-age": "90",
    max_age: "30",
    maxage: "60",
    "min.age": "1",
    " padded ": "trimmed",
    "2024": "integer-like key",
    a1: "letter first",
    "1a": "digit first",
  };
  const ordered = canonical(inputs);
  const salt = "5a1e".repeat(16);
  const commitmentInput = commitmentPreimage(circuit, ordered, salt);
  const nullifierInput = nullifierPreimage(salt);

  /* x402 authorization, signed exactly like the console and verified by src/lib/chain/x402.ts */
  const account = privateKeyToAccount(TEST_PRIVATE_KEY);
  const nonce = keccak256(stringToHex("sherwood-vector-nonce"));
  const authorization: TransferAuthorization = {
    from: account.address,
    to: MERCHANT,
    value: "10000",
    validAfter: String(NOW - 60),
    validBefore: String(NOW + 120),
    nonce,
  };
  const typedData = authorizationTypedData(network, authorization);
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        typeHash("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256(stringToHex(USDG_DOMAIN.name)),
        keccak256(stringToHex(USDG_DOMAIN.version)),
        BigInt(network.chainId),
        network.usdg,
      ],
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
      [
        typeHash("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        nonce,
      ],
    ),
  );
  const digest = hashTypedData(typedData);
  if (digest !== keccak256(concat(["0x1901", domainSeparator, structHash]))) {
    throw new Error("Manual EIP-712 encoding disagrees with viem's hashTypedData");
  }
  const signature = await account.signTypedData(typedData);
  const { r, s, v, yParity } = parseSignature(signature);

  const requirements = createRequirements({
    network,
    payTo: MERCHANT,
    amount: BigInt(authorization.value),
    resource: "https://sherwood.example/api/x402/premium",
    description: "Sherwood private agent signal feed",
  });
  const payment: PaymentPayload = { x402Version: 1, scheme: "exact", network: network.id, payload: { signature, authorization } };
  const settlement: SettlementResponse = {
    success: true,
    network: network.id,
    payer: account.address,
    transaction: keccak256(stringToHex("sherwood-vector-transaction")),
  };

  return {
    description: "Generated by scripts/generate-vectors.ts from the app's own code. Do not edit by hand; run `npm run vectors`.",
    agent: {
      runtimeId,
      agentId: keccak256(stringToHex(runtimeId)),
      capability,
      capabilityHash: keccak256(stringToHex(capability)),
      resultInput,
      resultHash: keccak256(stringToHex(resultInput)),
      capabilities,
      deploymentOptions,
      configJson,
      configCommitment: `0x${await sha256Hex(configJson)}`,
    },
    proof: {
      circuit,
      inputs,
      canonicalKeys: Object.keys(ordered),
      salt,
      commitmentPreimage: commitmentInput,
      commitment: `0x${await sha256Hex(commitmentInput)}`,
      nullifierPreimage: nullifierInput,
      nullifier: `0x${await sha256Hex(nullifierInput)}`,
    },
    authorization: {
      network: network.id,
      chainId: network.chainId,
      verifyingContract: network.usdg,
      privateKey: TEST_PRIVATE_KEY,
      from: authorization.from,
      to: authorization.to,
      value: Number(authorization.value),
      validAfter: Number(authorization.validAfter),
      validBefore: Number(authorization.validBefore),
      nonce,
      now: NOW,
      domainSeparator,
      structHash,
      digest,
      signature,
      v: Number(v ?? BigInt(yParity + 27)),
      r,
      s,
    },
    requirements,
    headers: {
      payment: encodeHeader(payment),
      settlement: encodeHeader(settlement),
      settlementJson: settlement,
    },
  };
}

async function main(): Promise<void> {
  const contents = `${JSON.stringify(await buildVectors(), null, 2)}\n`;
  const relative = path.relative(process.cwd(), OUTPUT);

  if (process.argv.includes("--check")) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== contents) {
      console.error(`✗ ${relative} is out of date. Run \`npm run vectors\` and commit the result.`);
      process.exit(1);
    }
    console.log(`✓ ${relative} matches the app code`);
    return;
  }

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, contents);
  console.log(`Wrote ${relative}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
