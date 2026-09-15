/**
 * End-to-end check of the ZKx8004 runtime in demo mode: every context and
 * action is exercised through the real executor with latency and RPC disabled.
 *
 * Run with: npm test
 */

import "./lib/load-env";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { ActionValidationError } from "@/lib/runtime/actions";
import { RUNTIME_TUNING } from "@/lib/runtime/catalog";
import { randomAddress } from "@/lib/runtime/crypto";
import { ZKRuntime } from "@/lib/runtime/runtime";

let passed = 0;

function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`✗ ${label}`);
  passed++;
  console.log(`✓ ${label}`);
}

async function rejects(promise: Promise<unknown>, pattern: RegExp, label: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    check(error instanceof Error && pattern.test(error.message), `${label} (${(error as Error).message})`);
    return;
  }
  throw new Error(`✗ ${label}: expected a rejection`);
}

async function main(): Promise<void> {
  const runtime = new ZKRuntime({ latencyScale: 0, rpc: false });
  runtime.hydrate();
  const recipient = randomAddress();

  /* wallet */
  await rejects(
    runtime.execute("processPayment", { amount: 1, currency: "USDG", recipient }),
    /Connect a wallet/,
    "payments require a connected wallet",
  );
  await rejects(runtime.execute("connectWallet", { provider: "injected" }), /No EVM wallet detected/, "missing injected wallet is reported");
  const wallet = await runtime.execute("connectWallet", { provider: "demo" });
  check(/^0x[0-9a-fA-F]{40}$/.test(wallet.address) && runtime.getSnapshot().mode === "demo", "demo wallet has a 0x address");

  /* privacy: proofs and vault */
  const proof = await runtime.execute("generateZKProof", {
    statement: "balance >= 100 USDG",
    circuit: "balance-threshold",
    privateInputs: { balance: "1250", account: "treasury" },
  });
  check(proof.proof.startsWith("zkp_") && proof.publicInputs.join() === "account,balance", "proof exposes only input names");

  const valid = await runtime.execute("verifyProof", { proof: proof.proof, publicInputs: proof.publicInputs, verificationKey: proof.verificationKey });
  check(valid.verified, "untouched proof verifies");

  const tampered = proof.proof.slice(0, -1) + (proof.proof.endsWith("0") ? "1" : "0");
  check(!(await runtime.execute("verifyProof", { proof: tampered, publicInputs: proof.publicInputs, verificationKey: proof.verificationKey })).verified, "altered proof is rejected");
  check(!(await runtime.execute("verifyProof", { proof: proof.proof, publicInputs: proof.publicInputs, verificationKey: "f".repeat(64) })).verified, "wrong verification key is rejected");

  const record = await runtime.execute("storePrivateData", { key: "strategy.notes", data: "secret plan" });
  check(record.encrypted && record.payload !== "secret plan", "vault stores ciphertext");
  check((await runtime.execute("retrievePrivateData", { key: "strategy.notes" })).data === "secret plan", "vault decrypts to the original data");

  /* validation */
  await rejects(runtime.execute("processPayment", { amount: 1, currency: "USDG", recipient: "0x123" }), /valid 0x address/, "invalid recipients fail validation");
  await rejects(runtime.execute("processPayment", { amount: 1, currency: "ETH", recipient, method: "x402" }), /settle in USDG/, "x402 is limited to USDG");
  try {
    await runtime.execute("processPayment", { amount: -1, currency: "USDG", recipient });
  } catch (error) {
    check(error instanceof ActionValidationError, "validation errors are typed");
  }

  /* payments */
  const payment = await runtime.execute("processPayment", { amount: 10, currency: "USDG", recipient, priority: "high", private: true, method: "x402" });
  const balances = runtime.payment.balanceOf(wallet.address);
  check(payment.proofId && payment.method === "x402" && payment.trace.length >= 5, "private x402 payment carries a proof and a trace");
  check(balances.USDG === 990 && Math.abs(balances.ETH - (RUNTIME_TUNING.startingBalances.ETH - payment.tx.fee)) < 1e-12, "balances debit amount and gas fee");
  check(/^0x[0-9a-f]{64}$/.test(payment.tx.hash) && payment.tx.network === ACTIVE_NETWORK.id, `payments reference a ${ACTIVE_NETWORK.name} transaction`);
  await rejects(runtime.execute("processPayment", { amount: 5000, currency: "USDG", recipient }), /Insufficient USDG/, "overspending is refused");

  await runtime.execute("requestAirdrop", { currency: "ETH" });
  check(runtime.payment.balanceOf(wallet.address).ETH > 0.7, "demo airdrop credits ETH");

  const premium = await runtime.execute("purchasePremium", {});
  check(premium.payment.method === "x402" && premium.payment.amount === 0.01 && premium.payment.resource, "premium resource is bought through x402");

  /* blockchain & registry */
  const networks = await runtime.execute("refreshNetworks", {});
  check(networks.length === 2 && networks.every((network) => network.name.startsWith("Robinhood")), "both Robinhood Chain networks are reported");
  await rejects(runtime.execute("anchorProof", { proofId: proof.id }), /registry first/, "anchoring needs a registry");

  const registry = await runtime.execute("deployRegistry", {});
  check(/^0x[0-9a-fA-F]{40}$/.test(registry.address) && registry.tx?.hash, "registry deployment returns an address and transaction");

  const anchored = await runtime.execute("anchorProof", { proofId: proof.id });
  check(anchored.anchor?.registry === registry.address, "proof commitment is anchored in the registry");
  const anchoredCheck = await runtime.execute("verifyProof", { proof: proof.proof, publicInputs: proof.publicInputs, verificationKey: proof.verificationKey });
  check(anchoredCheck.verified && anchoredCheck.anchored, "verification reports the anchor");
  await rejects(runtime.execute("anchorProof", { proofId: proof.id }), /already anchored/, "a proof is anchored only once");

  const ethBefore = runtime.payment.balanceOf(wallet.address).ETH;
  const transaction = await runtime.execute("executeTransaction", { to: registry.address, data: "rebalance", value: 0.01 });
  check(transaction.kind === "transfer" && runtime.payment.balanceOf(wallet.address).ETH < ethBefore - 0.01, "transactions debit value and fee");

  /* agents */
  await rejects(
    runtime.execute("deployAgent", { config: { name: "Bot", capabilities: ["payment-processing"], paymentRequired: false } }),
    /requires payments/,
    "capability requirements are enforced",
  );
  const agent = await runtime.execute("deployAgent", {
    config: {
      name: "PrivateTradingBot",
      capabilities: [
        "zk-proof-generation",
        "payment-processing",
        "contract-interaction",
        "private-data-analysis",
        "multi-party-computation",
        "autonomous-trading",
      ],
      privacy: true,
      paymentRequired: true,
    },
  });
  check(agent.status === "running" && agent.configProofId && agent.feePaymentId && agent.registration, "agent deploys with a config proof, fee and registry registration");
  check(/^0x[0-9a-f]{64}$/.test(agent.onChainId), "agent has a bytes32 on-chain id");

  const commands = [
    { command: "zk-proof-generation", parameters: { statement: "solvent", data: "snapshot" } },
    { command: "payment-processing", parameters: { amount: "1.5", recipient } },
    { command: "contract-interaction", parameters: { method: "rebalance" } },
    { command: "contract-interaction", parameters: { contract: registry.address, method: "ping" } },
    { command: "private-data-analysis", parameters: { data: "42, 17, 88" } },
    { command: "multi-party-computation", parameters: { computation: "sum", parties: "alice:12, bob:30" } },
    { command: "autonomous-trading", parameters: { strategy: "mean-reversion", assets: "ETH, USDG" } },
  ] as const;

  for (const { command, parameters } of commands) {
    const execution = await runtime.execute("agentCommand", { agentId: agent.id, command, parameters });
    check(execution.status === "completed", `agent runs ${command}: ${execution.output}`);
  }
  check(runtime.getSnapshot().blockchain.transactions.some((tx) => tx.kind === "execution"), "registry execution is recorded as a transaction");

  await rejects(
    runtime.execute("agentCommand", { agentId: agent.id, command: "payment-processing", parameters: { amount: "1", recipient: "bad" } }),
    /valid 0x recipient/,
    "failing commands surface their error",
  );
  check(runtime.getSnapshot().agents.executions[0].status === "failed", "failed commands are recorded");

  await runtime.execute("stopAgent", { agentId: agent.id, graceful: true });
  check(runtime.getSnapshot().blockchain.transactions.some((tx) => tx.kind === "status"), "stopping a registered agent updates the registry");
  await rejects(
    runtime.execute("agentCommand", { agentId: agent.id, command: "zk-proof-generation", parameters: {} }),
    /is stopped/,
    "stopped agents refuse commands",
  );
  await runtime.execute("removeAgent", { agentId: agent.id });
  check(runtime.getSnapshot().agents.agents.length === 0, "removed agents disappear");

  /* runtime */
  const snapshot = runtime.getSnapshot();
  check(snapshot.activity.some((event) => event.status === "error") && snapshot.activity.length > 20, "activity log records successes and errors");
  check(snapshot.memory.activeContexts.length === 6, "all contexts are active in memory");

  await runtime.execute("resetRuntime", {});
  const cleared = runtime.getSnapshot();
  check(!cleared.wallet.wallet && cleared.privacy.proofs.length === 0 && !cleared.blockchain.registries[ACTIVE_NETWORK.id], "reset clears every context");

  console.log(`\nAll ${passed} runtime checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
