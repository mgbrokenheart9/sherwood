/**
 * Agent Deployment Context: deploys autonomous agents, registers them in the
 * ZKx8004 registry on Robinhood Chain and runs their commands by composing
 * the privacy, payment and blockchain contexts.
 */

import { getAddress, isAddress, keccak256, stringToHex, type Hex } from "viem";
import { shorten } from "@/lib/format";
import { GAS_UNITS, RUNTIME_TUNING, getCapability } from "../catalog";
import { createId, randomHex, sha256Hex } from "../crypto";
import { liveTxRef } from "../tx";
import type { Agent, CapabilityId, CommandPriority, Execution, ResourceLimits, TxRef } from "../types";
import { errorMessage, nowIso, round, withTimeout } from "../utils";
import { BaseContext } from "./base";
import type { BlockchainContext } from "./blockchain";
import type { PaymentContext } from "./payment";
import type { PrivacyContext } from "./privacy";
import type { WalletContext } from "./wallet";

export interface AgentsState {
  agents: Agent[];
  executions: Execution[];
}

export interface DeployRequest {
  config: { name: string; capabilities: CapabilityId[]; privacy: boolean; paymentRequired: boolean };
  deploymentOptions: ResourceLimits;
}

export interface CommandRequest {
  agentId: string;
  command: CapabilityId;
  parameters: Record<string, string>;
  priority: CommandPriority;
}

interface CommandResult {
  output: string;
  tx?: TxRef;
}

const parseList = (value = ""): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export class AgentDeploymentContext extends BaseContext<AgentsState> {
  readonly id = "agents";
  readonly name = "Agent Deployment Context";
  readonly description = "Autonomous agent deployment and orchestration";

  protected initialState(): AgentsState {
    return { agents: [], executions: [] };
  }

  private get wallet(): WalletContext {
    return this.dependency<WalletContext>("wallet");
  }

  private get privacy(): PrivacyContext {
    return this.dependency<PrivacyContext>("privacy");
  }

  private get payment(): PaymentContext {
    return this.dependency<PaymentContext>("payment");
  }

  private get blockchain(): BlockchainContext {
    return this.dependency<BlockchainContext>("blockchain");
  }

  private requireAgent(agentId: string): Agent {
    const agent = this.state.agents.find((item) => item.id === agentId);
    if (!agent) throw new Error("Agent not found. It may have been removed.");
    return agent;
  }

  private patchAgent(agentId: string, patch: Partial<Agent>): Agent {
    const agent = { ...this.requireAgent(agentId), ...patch };
    this.setState({ agents: this.state.agents.map((item) => (item.id === agentId ? agent : item)) });
    return agent;
  }

  /**
   * Send a registry write. Agents registered in live mode need the live wallet;
   * demo registrations stay simulated.
   */
  private async registryWrite(
    mode: TxRef["mode"],
    label: string,
    kind: "register" | "status" | "execution",
    send: (live: NonNullable<ReturnType<WalletContext["liveChain"]>>, registry: Hex) => Promise<Parameters<typeof liveTxRef>[0]>,
  ): Promise<TxRef> {
    const wallet = this.wallet.requireWallet();
    const registry = this.blockchain.requireRegistry();
    const live = this.wallet.liveChain();
    let tx: TxRef;

    if (mode === "live") {
      if (!live) throw new Error("Connect the wallet that registered this agent to update it on-chain.");
      tx = liveTxRef(await send(live, registry.address), live.network);
    } else {
      this.payment.assertFunds(wallet.address, { ETH: this.blockchain.estimateFee(GAS_UNITS.registryWrite) });
      await this.latency.wait(500, 1000);
      tx = this.blockchain.simulateTx(GAS_UNITS.registryWrite);
      this.payment.debit(wallet.address, { ETH: tx.fee });
    }

    this.blockchain.recordTransaction({ kind, from: wallet.address, to: registry.address, data: label, value: 0, tx });
    return tx;
  }

  async deployAgent({ config, deploymentOptions }: DeployRequest): Promise<Agent> {
    const wallet = this.wallet.requireWallet();
    const capabilities = Array.from(new Set(config.capabilities));

    const needPrivacy = capabilities.filter((id) => getCapability(id).requiresPrivacy && !config.privacy);
    if (needPrivacy.length) {
      throw new Error(`${needPrivacy.map((id) => getCapability(id).name).join(", ")} requires privacy mode.`);
    }
    const needPayment = capabilities.filter((id) => getCapability(id).requiresPayment && !config.paymentRequired);
    if (needPayment.length) {
      throw new Error(`${needPayment.map((id) => getCapability(id).name).join(", ")} requires payments to be enabled.`);
    }
    if (this.state.agents.some((agent) => agent.status === "running" && agent.name.toLowerCase() === config.name.toLowerCase())) {
      throw new Error(`An agent named "${config.name}" is already running.`);
    }

    const live = this.wallet.liveChain();
    if (config.paymentRequired && !live) {
      this.payment.assertFunds(wallet.address, { USDG: RUNTIME_TUNING.agentDeploymentFeeUsdg });
    }

    const id = createId("agent");
    const onChainId = keccak256(stringToHex(id));

    const configProof = config.privacy
      ? await this.privacy.generateProof({
          statement: `agent ${config.name} runs an approved configuration`,
          circuit: "agent-config",
          privateInputs: {
            capabilities: capabilities.join(","),
            maxMemory: deploymentOptions.maxMemory,
            maxExecutionTime: deploymentOptions.maxExecutionTime,
            maxRequests: String(deploymentOptions.maxRequests),
          },
        })
      : undefined;
    const configCommitment: Hex = `0x${configProof?.verificationKey ?? (await sha256Hex(JSON.stringify({ capabilities, deploymentOptions })))}`;

    const registration = this.blockchain.registry()
      ? await this.registryWrite(live ? "live" : "demo", `registerAgent(${config.name})`, "register", (chain, registry) =>
          chain.registerAgent(registry, onChainId, configCommitment),
        )
      : undefined;

    const feePayment = config.paymentRequired
      ? await this.payment.charge(RUNTIME_TUNING.agentDeploymentFeeUsdg, `Deployment fee · ${config.name}`)
      : undefined;

    if (!registration) await this.latency.wait(900, 1700);

    const agent: Agent = {
      id,
      onChainId,
      name: config.name,
      owner: wallet.address,
      capabilities,
      privacy: config.privacy,
      paymentRequired: config.paymentRequired,
      status: "running",
      endpoint: `zkx8004://agents/${id}`,
      configProofId: configProof?.id,
      feePaymentId: feePayment?.id,
      registration,
      resourceLimits: deploymentOptions,
      security: {
        encryptedCommunication: config.privacy,
        zeroKnowledgeProofs: config.privacy,
        auditEnabled: true,
      },
      requests: 0,
      createdAt: nowIso(),
    };

    this.setState({ agents: [agent, ...this.state.agents] });
    return agent;
  }

  async runCommand(request: CommandRequest): Promise<Execution> {
    const agent = this.requireAgent(request.agentId);
    const capability = getCapability(request.command);

    if (agent.status !== "running") throw new Error(`Agent "${agent.name}" is stopped. Redeploy it to run commands.`);
    if (!agent.capabilities.includes(request.command)) {
      throw new Error(`Agent "${agent.name}" was not deployed with ${capability.name}.`);
    }
    if (agent.requests >= agent.resourceLimits.maxRequests) {
      throw new Error(`Agent "${agent.name}" reached its limit of ${agent.resourceLimits.maxRequests} requests.`);
    }

    const startedAt = nowIso();
    const started = performance.now();
    const timeoutMs = Number.parseInt(agent.resourceLimits.maxExecutionTime, 10) * 1000;

    let status: Execution["status"] = "completed";
    let result: CommandResult;
    try {
      result = await withTimeout(
        this.perform(agent, request.command, request.parameters),
        timeoutMs,
        `Execution exceeded the ${agent.resourceLimits.maxExecutionTime} limit.`,
      );
    } catch (error) {
      status = "failed";
      result = { output: errorMessage(error) };
    }

    const execution: Execution = {
      id: createId("exec"),
      agentId: agent.id,
      agentName: agent.name,
      command: request.command,
      parameters: request.parameters,
      priority: request.priority,
      status,
      output: result.output,
      durationMs: Math.round(performance.now() - started),
      tx: result.tx,
      startedAt,
    };

    this.patchAgent(agent.id, { requests: agent.requests + 1 });
    this.setState({ executions: [execution, ...this.state.executions].slice(0, RUNTIME_TUNING.historyLimit) });

    if (status === "failed") throw new Error(result.output);
    return execution;
  }

  private async perform(agent: Agent, command: CapabilityId, params: Record<string, string>): Promise<CommandResult> {
    switch (command) {
      case "zk-proof-generation": {
        const proof = await this.privacy.generateProof({
          statement: params.statement || `${agent.name} attestation`,
          circuit: "custom",
          privateInputs: { data: params.data || "agent-state" },
        });
        return { output: `Proof ${shorten(proof.proof, 8, 6)} generated for "${proof.statement}".` };
      }

      case "payment-processing": {
        const amount = Number(params.amount);
        const recipient = params.recipient?.trim() ?? "";
        if (!(amount > 0)) throw new Error("Provide a positive USDG amount.");
        if (!isAddress(recipient)) throw new Error("Provide a valid 0x recipient address.");

        const payment = await this.payment.processPayment({
          amount,
          currency: "USDG",
          recipient: getAddress(recipient),
          memo: `Agent ${agent.name}`,
          priority: "medium",
          private: agent.privacy,
          method: "x402",
        });
        return { output: `Settled ${amount} USDG to ${shorten(recipient, 6, 4)} · ${shorten(payment.tx.hash, 6, 6)}.`, tx: payment.tx };
      }

      case "contract-interaction": {
        const method = params.method?.trim() || "invoke";
        const target = params.contract?.trim();

        if (target) {
          if (!isAddress(target)) throw new Error("Contract must be a valid 0x address.");
          const entry = await this.blockchain.executeTransaction({ to: getAddress(target), data: method, value: 0 });
          return { output: `Called ${method} on ${shorten(target, 6, 4)} · block ${entry.tx.blockNumber.toLocaleString("en-US")}.`, tx: entry.tx };
        }

        if (!agent.registration) {
          throw new Error("This agent is not registered on-chain. Deploy the registry, then redeploy the agent.");
        }
        const capabilityHash = keccak256(stringToHex(method));
        const resultHash = keccak256(stringToHex(`${agent.id}|${method}|${Date.now()}`));
        const tx = await this.registryWrite(agent.registration.mode, `recordExecution(${method})`, "execution", (chain, registry) =>
          chain.recordExecution(registry, agent.onChainId, capabilityHash, resultHash),
        );
        return { output: `Recorded ${method} for ${agent.name} in the registry · block ${tx.blockNumber.toLocaleString("en-US")}.`, tx };
      }

      case "private-data-analysis": {
        const values = (params.data ?? "")
          .split(/[\s,]+/)
          .map(Number)
          .filter((value) => Number.isFinite(value));
        if (values.length === 0) throw new Error("Provide numeric values to analyse, e.g. 42, 17, 88.");

        await this.privacy.storePrivateData({ key: `${agent.id}.dataset.${Date.now().toString(36)}`, data: params.data, encrypt: true });
        const mean = round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
        const digest = await sha256Hex(values.join(","));
        return {
          output: `Analysed ${values.length} sealed values (${params.analysisType || "summary"}) · mean ${mean} · range ${Math.min(...values)}–${Math.max(...values)} · digest ${digest.slice(0, 12)}.`,
        };
      }

      case "multi-party-computation": {
        const parties = parseList(params.parties).map((entry) => {
          const [party, raw] = entry.split(":").map((part) => part.trim());
          return { party, value: Number(raw) };
        });
        if (parties.length < 2 || parties.some(({ party, value }) => !party || !Number.isFinite(value))) {
          throw new Error("Provide at least two parties as name:value, e.g. alice:12, bob:30.");
        }

        await Promise.all(parties.map(({ party, value }) => sha256Hex(`${party}|${value}|${randomHex(16)}`)));
        const fee = await this.payment.charge(RUNTIME_TUNING.capabilityFeeUsdg["multi-party-computation"] ?? 0, `MPC · ${agent.name}`);

        const computation = (params.computation || "sum").toLowerCase();
        const values = parties.map(({ value }) => value);
        const result =
          computation === "average" || computation === "mean"
            ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4)
            : computation === "max"
              ? Math.max(...values)
              : computation === "min"
                ? Math.min(...values)
                : values.reduce((sum, value) => sum + value, 0);
        return { output: `Joint ${computation} over ${parties.length} parties = ${result}. Individual inputs stayed sealed.`, tx: fee?.tx };
      }

      case "autonomous-trading": {
        const strategy = params.strategy?.trim() || "mean-reversion";
        const assets = parseList(params.assets);
        const pair = (assets.length ? assets : ["ETH", "USDG"]).join("/");

        const proof = await this.privacy.generateProof({
          statement: `strategy for ${pair} stays within risk policy`,
          circuit: "custom",
          privateInputs: { strategy, pair },
        });
        const fee = await this.payment.charge(RUNTIME_TUNING.capabilityFeeUsdg["autonomous-trading"] ?? 0, `Trading · ${agent.name}`);

        const seed = Number.parseInt(proof.verificationKey.slice(0, 8), 16);
        const pnl = ((seed % 700) - 200) / 100;
        return {
          output: `Executed ${strategy} on ${pair} · simulated PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}% · strategy proof ${shorten(proof.proof, 8, 6)}.`,
          tx: fee?.tx,
        };
      }
    }
  }

  async stopAgent(input: { agentId: string; graceful: boolean }): Promise<Agent> {
    const agent = this.requireAgent(input.agentId);
    if (agent.status === "stopped") return agent;

    if (agent.registration && this.blockchain.registry()) {
      await this.registryWrite(agent.registration.mode, `setAgentActive(${agent.name}, false)`, "status", (chain, registry) =>
        chain.setAgentActive(registry, agent.onChainId, false),
      );
    } else if (input.graceful) {
      await this.latency.wait(600, 1100);
    }

    return this.patchAgent(agent.id, { status: "stopped", stoppedAt: nowIso() });
  }

  async removeAgent(input: { agentId: string }): Promise<{ agentId: string; name: string }> {
    const agent = this.requireAgent(input.agentId);
    this.setState({
      agents: this.state.agents.filter((item) => item.id !== agent.id),
      executions: this.state.executions.filter((item) => item.agentId !== agent.id),
    });
    return { agentId: agent.id, name: agent.name };
  }
}
