"use client";

import { Play, Robot, Rocket, StopCircle, Trash } from "@phosphor-icons/react/dist/ssr";
import { useState, type FormEvent } from "react";
import { ACTIVE_NETWORK, TREASURY_ADDRESS } from "@/lib/chain/config";
import { formatRelative, shorten } from "@/lib/format";
import {
  CAPABILITIES,
  CAPABILITY_PARAMETERS,
  EXECUTION_LIMITS,
  MEMORY_LIMITS,
  RUNTIME_TUNING,
  getCapability,
} from "@/lib/runtime/catalog";
import type { Agent, CapabilityId, CommandPriority, ResourceLimits } from "@/lib/runtime/types";
import { ActionButton, Checkbox, Chip, Empty, Field, Notice, PanelSection, Segmented, Switch, TxLink } from "../controls";
import { useAction, useRuntimeState } from "../runtime-provider";
import { WalletGate, useRuntimeMode } from "./WalletPanel";

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

export function AgentsPanel({ variant = "full" }: { variant?: "full" | "compact" }) {
  const reason = `Connect a wallet to deploy autonomous agents on ${ACTIVE_NETWORK.name}.`;

  if (variant === "compact") {
    return (
      <WalletGate reason={reason}>
        <div className="stack">
          <AgentDeployForm />
          <AgentList compact />
        </div>
      </WalletGate>
    );
  }

  return (
    <WalletGate reason={reason}>
      <div className="cols">
        <AgentDeployForm />
        <div className="stack">
          <AgentList />
          <ExecutionHistory />
        </div>
      </div>
    </WalletGate>
  );
}

/* -------------------------------------------------------------------------- */

function AgentDeployForm() {
  const mode = useRuntimeMode();
  const registry = useRuntimeState((snapshot) => snapshot.blockchain.registries[ACTIVE_NETWORK.id]);
  const deploy = useAction("deployAgent");
  const [name, setName] = useState("PrivateTradingBot");
  const [capabilities, setCapabilities] = useState<CapabilityId[]>(["zk-proof-generation", "payment-processing"]);
  const [privacy, setPrivacy] = useState(true);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [maxMemory, setMaxMemory] = useState<ResourceLimits["maxMemory"]>("512MB");
  const [maxExecutionTime, setMaxExecutionTime] = useState<ResourceLimits["maxExecutionTime"]>("30s");
  const [maxRequests, setMaxRequests] = useState("1000");

  const selected = capabilities.map(getCapability);
  const privacyLocked = selected.some((capability) => capability.requiresPrivacy);
  const paymentLocked = selected.some((capability) => capability.requiresPayment);
  const effectivePrivacy = privacy || privacyLocked;
  const effectivePayment = paymentRequired || paymentLocked;

  const feeLabel =
    mode === "live" && !TREASURY_ADDRESS
      ? "No protocol fee in live mode (no treasury configured)"
      : `${RUNTIME_TUNING.agentDeploymentFeeUsdg} USDG deployment fee`;

  const toggleCapability = (id: CapabilityId, checked: boolean) =>
    setCapabilities((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void deploy.run({
      config: { name, capabilities, privacy: effectivePrivacy, paymentRequired: effectivePayment },
      deploymentOptions: { maxMemory, maxExecutionTime, maxRequests: Number(maxRequests) },
    });
  };

  return (
    <form className="panel" onSubmit={onSubmit}>
      <PanelSection label="Configure agent">
        <div className="stack">
          <Field label="Agent name">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </Field>

          <div className="field">
            <span className="field__label">
              <span>Capabilities</span>
              <span>{capabilities.length} selected</span>
            </span>
            <div className="stack stack--sm">
              {CAPABILITIES.map((capability) => (
                <Checkbox
                  key={capability.id}
                  checked={capabilities.includes(capability.id)}
                  onChange={(checked) => toggleCapability(capability.id, checked)}
                >
                  <span>{capability.name}</span>
                  <span className="row__sub row__sub--wrap">{capability.description}</span>
                  {(capability.requiresPrivacy || capability.requiresPayment) && (
                    <span className="check__tags">
                      {capability.requiresPrivacy && <Chip>privacy</Chip>}
                      {capability.requiresPayment && <Chip>payment</Chip>}
                    </span>
                  )}
                </Checkbox>
              ))}
            </div>
          </div>
        </div>
      </PanelSection>

      <PanelSection label="Security & limits">
        <div className="stack">
          <Switch
            label="Privacy mode"
            hint={privacyLocked ? "Required by selected capabilities" : "Proof of configuration + encrypted comms"}
            checked={effectivePrivacy}
            disabled={privacyLocked}
            onChange={setPrivacy}
          />
          <Switch
            label="Payments"
            hint={paymentLocked ? `Required · ${feeLabel}` : feeLabel}
            checked={effectivePayment}
            disabled={paymentLocked}
            onChange={setPaymentRequired}
          />
          <div className="grid-3">
            <Field label="Memory">
              <select className="select" value={maxMemory} onChange={(event) => setMaxMemory(event.target.value as ResourceLimits["maxMemory"])}>
                {MEMORY_LIMITS.map((limit) => (
                  <option key={limit}>{limit}</option>
                ))}
              </select>
            </Field>
            <Field label="Timeout">
              <select
                className="select"
                value={maxExecutionTime}
                onChange={(event) => setMaxExecutionTime(event.target.value as ResourceLimits["maxExecutionTime"])}
              >
                {EXECUTION_LIMITS.map((limit) => (
                  <option key={limit}>{limit}</option>
                ))}
              </select>
            </Field>
            <Field label="Requests">
              <input className="input" inputMode="numeric" value={maxRequests} onChange={(event) => setMaxRequests(event.target.value)} />
            </Field>
          </div>

          <p className="row__sub row__sub--wrap">
            {registry
              ? `The agent will be registered in the ZKx8004 registry on ${ACTIVE_NETWORK.name}.`
              : "No registry yet: the agent runs off-chain. Deploy the registry in the Blockchain tab to register agents on-chain."}
          </p>

          <ActionButton type="submit" variant="primary" icon={<Rocket size={16} />} pending={deploy.pending} block>
            Deploy agent
          </ActionButton>
          {deploy.status === "error" && <Notice tone="error">{deploy.error}</Notice>}
          {deploy.status === "success" && (
            <Notice tone="success">
              {deploy.result.name} is running
              {deploy.result.registration && (
                <>
                  {" "}
                  · registered in <TxLink tx={deploy.result.registration} />
                </>
              )}
            </Notice>
          )}
        </div>
      </PanelSection>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function AgentList({ compact = false }: { compact?: boolean }) {
  const agents = useRuntimeState((snapshot) => snapshot.agents.agents);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = compact ? agents.slice(0, 3) : agents;

  return (
    <div className="panel">
      <PanelSection label="Agents" end={<span>{agents.filter((agent) => agent.status === "running").length} running</span>}>
        {agents.length === 0 ? (
          <Empty>No agents deployed yet.</Empty>
        ) : (
          <div className="list">
            {visible.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                open={!compact && openId === agent.id}
                onToggle={compact ? undefined : () => setOpenId((current) => (current === agent.id ? null : agent.id))}
              />
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

function AgentRow({ agent, open, onToggle }: { agent: Agent; open: boolean; onToggle?: () => void }) {
  const stop = useAction("stopAgent");
  const remove = useAction("removeAgent");
  const running = agent.status === "running";
  const error = stop.status === "error" ? stop.error : remove.status === "error" ? remove.error : null;

  return (
    <div className="list__item list__item--stacked">
      <div className="row">
        <Robot className="row__icon" size={18} />
        <span className="row__main">
          <span>{agent.name}</span>
          <span className="row__sub">
            {agent.capabilities.length} capabilities · {agent.requests}/{agent.resourceLimits.maxRequests} requests ·{" "}
            {agent.registration ? <TxLink tx={agent.registration} label="on-chain" /> : "off-chain"} · {formatRelative(agent.createdAt)}
          </span>
        </span>
        <span className="row__end">
          <Chip tone={running ? "ok" : undefined}>{running ? "Running" : "Stopped"}</Chip>
          {onToggle && running && (
            <ActionButton size="sm" icon={<Play size={12} weight="fill" />} aria-expanded={open} onClick={onToggle}>
              {open ? "Close" : "Command"}
            </ActionButton>
          )}
          {running ? (
            <ActionButton
              size="sm"
              aria-label={`Stop ${agent.name}`}
              icon={<StopCircle size={14} />}
              pending={stop.pending}
              onClick={() => void stop.run({ agentId: agent.id, graceful: true })}
            />
          ) : (
            <ActionButton
              size="sm"
              variant="danger"
              aria-label={`Remove ${agent.name}`}
              icon={<Trash size={14} />}
              pending={remove.pending}
              onClick={() => void remove.run({ agentId: agent.id })}
            />
          )}
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {open && running && <CommandRunner agent={agent} />}
    </div>
  );
}

function CommandRunner({ agent }: { agent: Agent }) {
  const command = useAction("agentCommand");
  const [capability, setCapability] = useState<CapabilityId>(agent.capabilities[0]);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<CommandPriority>("normal");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const fields = CAPABILITY_PARAMETERS[capability];
    const payload = Object.fromEntries(fields.map((field) => [field.name, parameters[field.name] ?? ""]));
    void command.run({ agentId: agent.id, command: capability, parameters: payload, priority });
  };

  return (
    <form className="stack command-runner" onSubmit={onSubmit}>
      <dl className="kv">
        <dt>Endpoint</dt>
        <dd className="mono">{agent.endpoint}</dd>
        <dt>On-chain id</dt>
        <dd className="mono">{shorten(agent.onChainId, 8, 6)}</dd>
        <dt>Limits</dt>
        <dd>
          {agent.resourceLimits.maxMemory} · {agent.resourceLimits.maxExecutionTime}
        </dd>
        <dt>Security</dt>
        <dd>{agent.privacy ? "ZK proofs · encrypted" : "Public"} · audit on</dd>
        {agent.registration && (
          <>
            <dt>Registration</dt>
            <dd>
              <TxLink tx={agent.registration} />
            </dd>
          </>
        )}
      </dl>

      <Field label="Capability">
        <select
          className="select"
          value={capability}
          onChange={(event) => {
            setCapability(event.target.value as CapabilityId);
            setParameters({});
            command.reset();
          }}
        >
          {agent.capabilities.map((id) => (
            <option key={id} value={id}>
              {getCapability(id).name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid-2">
        {CAPABILITY_PARAMETERS[capability].map((field) => (
          <Field key={field.name} label={field.label}>
            <input
              className="input input--mono"
              placeholder={field.placeholder}
              value={parameters[field.name] ?? ""}
              onChange={(event) => setParameters((current) => ({ ...current, [field.name]: event.target.value }))}
            />
          </Field>
        ))}
      </div>

      <div className="input-group input-group--wrap input-group--center">
        <Segmented label="Priority" value={priority} options={PRIORITIES} onChange={setPriority} />
        <ActionButton type="submit" variant="primary" icon={<Play size={14} weight="fill" />} pending={command.pending}>
          Run command
        </ActionButton>
      </div>

      {command.status === "error" && <Notice tone="error">{command.error}</Notice>}
      {command.status === "success" && (
        <Notice tone="success">
          {command.result.output} <span className="mono">({command.result.durationMs}ms)</span>
          {command.result.tx && (
            <>
              {" "}
              · <TxLink tx={command.result.tx} />
            </>
          )}
        </Notice>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */

export function ExecutionHistory({ limit = 6 }: { limit?: number }) {
  const executions = useRuntimeState((snapshot) => snapshot.agents.executions);

  return (
    <div className="panel">
      <PanelSection label="Execution history" end={<span>{executions.length}</span>}>
        {executions.length === 0 ? (
          <Empty>Run a command to see executions here.</Empty>
        ) : (
          <div className="list">
            {executions.slice(0, limit).map((execution) => (
              <div key={execution.id} className="list__item">
                <Play className="row__icon" size={15} />
                <span className="row__main">
                  <span>
                    {execution.agentName} · {getCapability(execution.command).name}
                  </span>
                  <span className="row__sub row__sub--wrap">
                    {execution.output}
                    {execution.tx && (
                      <>
                        {" "}
                        <TxLink tx={execution.tx} />
                      </>
                    )}
                  </span>
                </span>
                <span className="row__end">
                  <Chip tone={execution.status === "completed" ? "ok" : "err"}>{execution.durationMs}ms</Chip>
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}
