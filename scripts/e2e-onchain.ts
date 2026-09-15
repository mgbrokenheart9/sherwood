/**
 * On-chain end-to-end run on the active Robinhood Chain network (mainnet by
 * default). Spends real funds: USDG for two x402 payments and ETH for gas.
 *
 *   npm run e2e:mainnet -- --check   funding preflight only
 *   npm run e2e:mainnet -- --wait    wait until the wallets are funded, then run
 *   npm run e2e:mainnet              run now
 *
 * The x402 HTTP step needs the app running with the same .env.local
 * (BASE_URL, default http://localhost:3000).
 */

import "./lib/load-env";
import { formatUnits, isAddressEqual, keccak256, parseEventLogs, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDG_ABI, USDG_DECIMALS } from "@/lib/chain/abi";
import { ACTIVE_NETWORK, explorerAddress, explorerTx, registryEnvName } from "@/lib/chain/config";
import { LiveChain, publicClientFor, readBalances } from "@/lib/chain/live";
import { REGISTRY_ABI, REGISTRY_BYTECODE } from "@/lib/chain/registry-artifact";
import {
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  authorizationTypedData,
  createAuthorization,
  decodeHeader,
  encodeHeader,
  paymentRequiredSchema,
  toUsdgUnits,
  type PaymentPayload,
  type SettlementResponse,
} from "@/lib/chain/x402";
import { upsertEnv } from "./lib/env-file";

const network = ACTIVE_NETWORK;
const client = publicClientFor(network);
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const args = new Set(process.argv.slice(2));

const WAIT_INTERVAL_MS = 30_000;
const WAIT_LIMIT_MS = Number(process.env.E2E_WAIT_MINUTES ?? 240) * 60_000;

/** Gas budget per step, with headroom for the L1 data fee on an Orbit chain. */
const GAS = { authorization: 150_000n, anchor: 200_000n, register: 200_000n, execution: 150_000n, status: 120_000n, deploy: 3_000_000n };
const GAS_HEADROOM = 3n;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

function requireKey(name: string): Hex {
  const value = process.env[name];
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    console.error(`Missing ${name}. Run: npm run wallets:setup`);
    process.exit(1);
  }
  return value as Hex;
}

const payer = privateKeyToAccount(requireKey("E2E_PAYER_PRIVATE_KEY"));
const facilitator = privateKeyToAccount(requireKey("X402_FACILITATOR_PRIVATE_KEY"));
const payTo = (process.env.X402_PAY_TO ?? facilitator.address) as Address;
const price = process.env.X402_PRICE_USDG ?? "0.01";
const priceUnits = toUsdgUnits(price);

let completed = 0;

function done(name: string, detail: string, hash?: Hex): void {
  completed++;
  console.log(`✓ ${name}: ${detail}${hash ? `\n    ${explorerTx(network, hash)}` : ""}`);
}

function configuredRegistry(): Address | undefined {
  const value = process.env[registryEnvName(network)];
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;
}

/** Reads at a specific block, retrying while lagging RPC nodes catch up. */
async function atBlock<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= 8) throw error;
      await sleep(1000);
    }
  }
}

/* ------------------------------------------------------------------ funding */

interface FundingRow {
  wallet: string;
  address: Address;
  asset: "ETH" | "USDG";
  have: bigint;
  need: bigint;
  decimals: number;
}

async function fundingPlan(): Promise<{ gasPrice: bigint; rows: FundingRow[]; funded: boolean }> {
  const gasPrice = await client.getGasPrice();
  const deployGas = configuredRegistry() ? 0n : GAS.deploy;
  const payerGas = (GAS.authorization + GAS.anchor + GAS.register + GAS.execution + GAS.status + deployGas) * GAS_HEADROOM;

  const [payerEth, payerUsdg, facilitatorEth] = await Promise.all([
    client.getBalance({ address: payer.address }),
    client.readContract({ address: network.usdg, abi: USDG_ABI, functionName: "balanceOf", args: [payer.address] }),
    client.getBalance({ address: facilitator.address }),
  ]);

  const rows: FundingRow[] = [
    { wallet: "Payer", address: payer.address, asset: "ETH", have: payerEth, need: payerGas * gasPrice, decimals: 18 },
    { wallet: "Payer", address: payer.address, asset: "USDG", have: payerUsdg, need: priceUnits * 2n, decimals: USDG_DECIMALS },
    { wallet: "Facilitator", address: facilitator.address, asset: "ETH", have: facilitatorEth, need: GAS.authorization * GAS_HEADROOM * gasPrice, decimals: 18 },
  ];
  return { gasPrice, rows, funded: rows.every((row) => row.have >= row.need) };
}

function printPlan(plan: Awaited<ReturnType<typeof fundingPlan>>): void {
  console.log(`\n${network.name} (chain ${network.chainId}) · gas ${formatUnits(plan.gasPrice, 9)} gwei`);
  for (const row of plan.rows) {
    const ok = row.have >= row.need;
    console.log(
      `${ok ? "✓" : "✗"} ${row.wallet.padEnd(11)} ${row.asset.padEnd(4)} have ${formatUnits(row.have, row.decimals)} · need ≥ ${formatUnits(row.need, row.decimals)} → ${row.address}`,
    );
  }
}

/* ------------------------------------------------------------------- checks */

async function assertUsdgTransfer(hash: Hex, from: Address, to: Address, value: bigint): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${explorerTx(network, hash)}`);

  const transfers = parseEventLogs({ abi: USDG_ABI, eventName: "Transfer", logs: receipt.logs });
  const matched = transfers.some(
    (log) =>
      isAddressEqual(log.address, network.usdg) &&
      isAddressEqual(log.args.from, from) &&
      isAddressEqual(log.args.to, to) &&
      log.args.value === value,
  );
  if (!matched) throw new Error(`No matching USDG Transfer event in ${explorerTx(network, hash)}`);
}

/* -------------------------------------------------------------------- steps */

async function x402OverHttp(): Promise<void> {
  const supported = (await fetch(`${BASE_URL}/api/x402/supported`)
    .then((response) => response.json())
    .catch(() => null)) as { facilitatorConfigured?: boolean; network?: { id?: string } } | null;

  if (!supported) throw new Error(`App not reachable at ${BASE_URL}. Start it with: npm run build && npm start`);
  if (!supported.facilitatorConfigured) throw new Error("The running app has no X402_FACILITATOR_PRIVATE_KEY.");
  if (supported.network?.id !== network.id) {
    throw new Error(`The running app is on ${supported.network?.id}, expected ${network.id}. Rebuild after changing .env.local.`);
  }

  const challenge = await fetch(`${BASE_URL}/api/x402/premium`);
  if (challenge.status !== 402) throw new Error(`Expected 402 Payment Required, got ${challenge.status}.`);
  const [requirements] = paymentRequiredSchema.parse(await challenge.json()).accepts;
  done("402 challenge", `${formatUnits(BigInt(requirements.maxAmountRequired), USDG_DECIMALS)} USDG to ${requirements.payTo}`);

  const authorization = createAuthorization({
    from: payer.address,
    to: requirements.payTo,
    value: BigInt(requirements.maxAmountRequired),
    validForSeconds: requirements.maxTimeoutSeconds,
  });
  const signature = await payer.signTypedData(authorizationTypedData(network, authorization));
  const payment: PaymentPayload = { x402Version: X402_VERSION, scheme: "exact", network: network.id, payload: { signature, authorization } };

  const response = await fetch(`${BASE_URL}/api/x402/premium`, { headers: { [PAYMENT_HEADER]: encodeHeader(payment) } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Premium request failed (${response.status}): ${JSON.stringify(body)}`);

  const header = response.headers.get(PAYMENT_RESPONSE_HEADER);
  const settlement = header ? (decodeHeader(header) as SettlementResponse) : undefined;
  if (!settlement?.success || !settlement.transaction) throw new Error("The response has no settlement receipt.");

  await assertUsdgTransfer(settlement.transaction, payer.address, requirements.payTo, BigInt(requirements.maxAmountRequired));
  done("x402 over HTTP", `200 OK · facilitator settled ${price} USDG · USDG Transfer event verified`, settlement.transaction);
}

async function x402SelfSettled(): Promise<void> {
  const chain = new LiveChain(network, { type: "local", account: payer });
  const authorization = createAuthorization({ from: payer.address, to: payTo, value: priceUnits, validForSeconds: 600 });
  const signature = await chain.signAuthorization(authorization);
  const tx = await chain.submitAuthorization(authorization, signature);
  await assertUsdgTransfer(tx.hash, payer.address, payTo, priceUnits);
  done("x402 self-settled", `payer broadcast transferWithAuthorization for ${price} USDG (fee ${tx.fee} ETH)`, tx.hash);
}

async function registryFlow(): Promise<void> {
  const chain = new LiveChain(network, { type: "local", account: payer });
  let registry = configuredRegistry();

  if (registry) {
    const code = await client.getCode({ address: registry });
    if (!code || code === "0x") throw new Error(`${registryEnvName(network)} points to an address without code.`);
    done("Registry", `using ${registry}`);
  } else {
    const tx = await chain.deployRegistry();
    if (!tx.contractAddress) throw new Error("The deployment receipt has no contract address.");
    registry = tx.contractAddress;
    const deployed = await atBlock(() => client.getCode({ address: registry as Address, blockNumber: BigInt(tx.blockNumber) }));
    if (!deployed || deployed === "0x") throw new Error("Registry bytecode not found after deployment.");
    upsertEnv({ [registryEnvName(network)]: registry });
    done("Registry deployed", `${registry} · ${REGISTRY_BYTECODE.length / 2 - 1} bytes · saved to .env.local (fee ${tx.fee} ETH)`, tx.hash);
  }

  const registryAddress = registry;
  const stamp = `${Date.now()}|${payer.address}`;
  const commitment = keccak256(stringToHex(`commit|${stamp}`));
  const nullifier = keccak256(stringToHex(`nullifier|${stamp}`));

  const anchorTx = await chain.anchorProof(registryAddress, commitment, nullifier, "e2e");
  const [owner, , storedNullifier] = await atBlock(() =>
    client.readContract({ address: registryAddress, abi: REGISTRY_ABI, functionName: "getAnchor", args: [commitment], blockNumber: BigInt(anchorTx.blockNumber) }),
  );
  if (!isAddressEqual(owner, payer.address) || storedNullifier !== nullifier) throw new Error("Anchor state does not match.");
  done("Proof anchored", `commitment ${short(commitment)} owned by the payer`, anchorTx.hash);

  const agentId = keccak256(stringToHex(`agent|${stamp}`));
  const configCommitment = keccak256(stringToHex(`config|${stamp}`));
  const registerTx = await chain.registerAgent(registryAddress, agentId, configCommitment);
  const registered = await atBlock(() =>
    client.readContract({ address: registryAddress, abi: REGISTRY_ABI, functionName: "getAgent", args: [agentId], blockNumber: BigInt(registerTx.blockNumber) }),
  );
  if (!registered.active || registered.configCommitment !== configCommitment) throw new Error("Agent registration state does not match.");
  done("Agent registered", `agent ${short(agentId)} active with its config commitment`, registerTx.hash);

  const executionTx = await chain.recordExecution(registryAddress, agentId, keccak256(stringToHex("contract-interaction")), keccak256(stringToHex(`result|${stamp}`)));
  const executed = await atBlock(() =>
    client.readContract({ address: registryAddress, abi: REGISTRY_ABI, functionName: "getAgent", args: [agentId], blockNumber: BigInt(executionTx.blockNumber) }),
  );
  if (executed.executions !== 1) throw new Error(`Expected 1 execution, found ${executed.executions}.`);
  done("Execution recorded", "executions counter is 1", executionTx.hash);

  const statusTx = await chain.setAgentActive(registryAddress, agentId, false);
  const stopped = await atBlock(() =>
    client.readContract({ address: registryAddress, abi: REGISTRY_ABI, functionName: "getAgent", args: [agentId], blockNumber: BigInt(statusTx.blockNumber) }),
  );
  if (stopped.active) throw new Error("Agent is still active after setAgentActive(false).");
  done("Agent stopped", "active flag is false", statusTx.hash);

  console.log(`    Registry: ${explorerAddress(network, registryAddress)}`);
}

/* --------------------------------------------------------------------- main */

async function main(): Promise<void> {
  console.log(`ZKx8004 on-chain end-to-end · ${network.name} (chain ${network.chainId})`);
  if (!network.testnet) console.log("Mainnet: this run spends real ETH and USDG.");

  let plan = await fundingPlan();
  printPlan(plan);
  if (args.has("--check")) process.exit(plan.funded ? 0 : 2);

  if (!plan.funded && args.has("--wait")) {
    const started = Date.now();
    let lastSeen = plan.rows.map((row) => row.have).join("|");
    console.log(`\nWaiting for funding, checking every ${WAIT_INTERVAL_MS / 1000}s…`);
    while (!plan.funded) {
      if (Date.now() - started > WAIT_LIMIT_MS) {
        console.error("Timed out waiting for funding.");
        process.exit(2);
      }
      await sleep(WAIT_INTERVAL_MS);
      plan = await fundingPlan().catch(() => plan);
      const seen = plan.rows.map((row) => row.have).join("|");
      if (seen !== lastSeen) {
        printPlan(plan);
        lastSeen = seen;
      }
    }
  }

  if (!plan.funded) {
    console.error("\nFund the wallets marked ✗ above, then run again (or pass --wait).");
    process.exit(2);
  }

  console.log("\n— x402 over HTTP (facilitator settlement)");
  await x402OverHttp();
  console.log("\n— x402 self-settled authorization");
  await x402SelfSettled();
  console.log("\n— ZKx8004 registry");
  await registryFlow();

  const balances = await readBalances(network, payer.address);
  console.log(`\nAll ${completed} on-chain steps succeeded on ${network.name}.`);
  console.log(`Payer balance now: ${balances.ETH} ETH · ${balances.USDG} USDG`);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
