"use client";

import { Eye, EyeSlash, Fingerprint, LockKey, Plus, ShieldCheck, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { useState, type FormEvent } from "react";
import { formatBytes, formatRelative, shorten } from "@/lib/format";
import { ACTIVE_NETWORK } from "@/lib/chain/config";
import { CIRCUITS } from "@/lib/runtime/catalog";
import type { CircuitId, ZKProof } from "@/lib/runtime/types";
import { ActionButton, Chip, Empty, Field, Notice, PanelSection, Segmented, Switch, TxLink } from "../controls";
import { useAction, useRuntimeState } from "../runtime-provider";

type Tab = "proofs" | "vault";

const TABS = [
  { value: "proofs", label: "Proofs" },
  { value: "vault", label: "Private vault" },
] as const;

export function PrivacyPanel() {
  const [tab, setTab] = useState<Tab>("proofs");
  return (
    <div className="stack">
      <Segmented label="Privacy tools" value={tab} options={TABS} onChange={setTab} />
      {tab === "proofs" ? <ProofStudio /> : <VaultManager />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Proofs                                                                     */
/* -------------------------------------------------------------------------- */

interface InputRow {
  id: string;
  name: string;
  value: string;
}

function VerifiedChip({ proof }: { proof: ZKProof }) {
  if (proof.verified === null) return <Chip>Unverified</Chip>;
  return proof.verified ? <Chip tone="ok">Verified</Chip> : <Chip tone="err">Rejected</Chip>;
}

function RecentProofs({ proofs, onLoad }: { proofs: ZKProof[]; onLoad: (proof: ZKProof) => void }) {
  const anchor = useAction("anchorProof");
  const registry = useRuntimeState((snapshot) => snapshot.blockchain.registries[ACTIVE_NETWORK.id]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onAnchor = async (proofId: string) => {
    setBusyId(proofId);
    await anchor.run({ proofId });
    setBusyId(null);
  };

  return (
    <div className="panel">
      <PanelSection label="Recent proofs" end={<span>{proofs.length}</span>}>
        {proofs.length === 0 ? (
          <Empty>No proofs yet.</Empty>
        ) : (
          <div className="list">
            {proofs.slice(0, 5).map((proof) => (
              <div key={proof.id} className="list__item">
                <Fingerprint className="row__icon" size={17} />
                <span className="row__main">
                  <button type="button" className="linklike mono" title="Load into the verifier" onClick={() => onLoad(proof)}>
                    {shorten(proof.proof, 10, 6)}
                  </button>
                  <span className="row__sub">
                    {proof.circuit} · {formatRelative(proof.createdAt)}
                    {proof.anchor && (
                      <>
                        {" · anchored "}
                        <TxLink tx={proof.anchor} />
                      </>
                    )}
                  </span>
                </span>
                <span className="row__end">
                  <VerifiedChip proof={proof} />
                  {!proof.anchor && (
                    <ActionButton
                      size="sm"
                      pending={anchor.pending && busyId === proof.id}
                      disabled={!registry || anchor.pending}
                      title={registry ? `Anchor the commitment on ${ACTIVE_NETWORK.name}` : "Deploy the registry first"}
                      onClick={() => void onAnchor(proof.id)}
                    >
                      Anchor
                    </ActionButton>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {!registry && proofs.length > 0 && (
          <p className="row__sub row__sub--wrap">Deploy or import the ZKx8004 registry in the Blockchain tab to anchor proofs on-chain.</p>
        )}
        {anchor.status === "error" && <Notice tone="error">{anchor.error}</Notice>}
      </PanelSection>
    </div>
  );
}

function ProofStudio() {
  const proofs = useRuntimeState((snapshot) => snapshot.privacy.proofs);
  const generate = useAction("generateZKProof");
  const verify = useAction("verifyProof");

  const [statement, setStatement] = useState("balance >= 100 USDG");
  const [circuit, setCircuit] = useState<CircuitId>("balance-threshold");
  const [rows, setRows] = useState<InputRow[]>([
    { id: "row-1", name: "balance", value: "1250" },
    { id: "row-2", name: "account", value: "treasury-01" },
  ]);

  const [proofValue, setProofValue] = useState("");
  const [verificationKey, setVerificationKey] = useState("");
  const [publicInputs, setPublicInputs] = useState("");

  const updateRow = (id: string, patch: Partial<InputRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const loadProof = (proof: ZKProof) => {
    setProofValue(proof.proof);
    setVerificationKey(proof.verificationKey);
    setPublicInputs(proof.publicInputs.join(", "));
    verify.reset();
  };

  const onGenerate = async (event: FormEvent) => {
    event.preventDefault();
    const privateInputs = Object.fromEntries(
      rows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), row.value]),
    );
    const proof = await generate.run({ statement, circuit, privateInputs });
    if (proof) loadProof(proof);
  };

  const onVerify = (event: FormEvent) => {
    event.preventDefault();
    void verify.run({
      proof: proofValue.trim(),
      verificationKey: verificationKey.trim(),
      publicInputs: publicInputs
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="cols">
      <form className="panel" onSubmit={onGenerate}>
        <PanelSection label="Generate proof">
          <div className="stack">
            <Field label="Public statement">
              <input className="input" value={statement} onChange={(event) => setStatement(event.target.value)} maxLength={280} />
            </Field>
            <Field label="Circuit">
              <select className="select" value={circuit} onChange={(event) => setCircuit(event.target.value as CircuitId)}>
                {CIRCUITS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="field">
              <span className="field__label">
                <span>Private inputs</span>
                <span>never revealed</span>
              </span>
              {rows.map((row) => (
                <div className="input-group" key={row.id}>
                  <input
                    className="input input--mono"
                    aria-label="Input name"
                    placeholder="name"
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                  />
                  <input
                    className="input input--mono"
                    aria-label="Input value"
                    placeholder="value"
                    value={row.value}
                    onChange={(event) => updateRow(row.id, { value: event.target.value })}
                  />
                  <ActionButton
                    aria-label="Remove input"
                    icon={<X size={14} />}
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  />
                </div>
              ))}
              <ActionButton
                size="sm"
                icon={<Plus size={13} />}
                disabled={rows.length >= 8}
                onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), name: "", value: "" }])}
              >
                Add input
              </ActionButton>
            </div>

            <ActionButton type="submit" variant="primary" icon={<Fingerprint size={16} />} pending={generate.pending} block>
              Generate proof
            </ActionButton>
            {generate.status === "error" && <Notice tone="error">{generate.error}</Notice>}
          </div>
        </PanelSection>
      </form>

      <div className="stack">
        <form className="panel" onSubmit={onVerify}>
          <PanelSection label="Verify proof" end={<span>edit a value to test tampering</span>}>
            <div className="stack">
              <Field label="Proof">
                <input className="input input--mono" value={proofValue} onChange={(event) => setProofValue(event.target.value)} placeholder="zkp_…" />
              </Field>
              <Field label="Verification key">
                <input className="input input--mono" value={verificationKey} onChange={(event) => setVerificationKey(event.target.value)} />
              </Field>
              <Field label="Public inputs" hint="comma separated">
                <input className="input input--mono" value={publicInputs} onChange={(event) => setPublicInputs(event.target.value)} />
              </Field>
              <ActionButton type="submit" icon={<ShieldCheck size={16} />} pending={verify.pending} disabled={!proofValue} block>
                Verify
              </ActionButton>
              {verify.status === "success" && (
                <Notice tone={verify.result.verified ? "success" : "error"}>
                  {verify.result.verified ? "Valid · " : "Invalid · "}
                  {verify.result.reason}
                </Notice>
              )}
              {verify.status === "error" && <Notice tone="error">{verify.error}</Notice>}
            </div>
          </PanelSection>
        </form>

        <RecentProofs proofs={proofs} onLoad={loadProof} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vault                                                                      */
/* -------------------------------------------------------------------------- */

function omitKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function VaultManager() {
  const records = useRuntimeState((snapshot) => snapshot.privacy.vault);
  const store = useAction("storePrivateData");
  const retrieve = useAction("retrievePrivateData");
  const remove = useAction("deletePrivateData");

  const [key, setKey] = useState("strategy.notes");
  const [data, setData] = useState("Rebalance ETH/USDG when spread > 0.4%");
  const [encrypt, setEncrypt] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const onStore = async (event: FormEvent) => {
    event.preventDefault();
    const record = await store.run({ key, data, encrypt });
    if (record) setRevealed((current) => omitKey(current, record.key));
  };

  const reveal = async (recordKey: string) => {
    setBusyKey(recordKey);
    const result = await retrieve.run({ key: recordKey });
    if (result) setRevealed((current) => ({ ...current, [recordKey]: result.data }));
    setBusyKey(null);
  };

  const hide = (recordKey: string) => setRevealed((current) => omitKey(current, recordKey));

  const onDelete = async (recordKey: string) => {
    setBusyKey(recordKey);
    await remove.run({ key: recordKey });
    hide(recordKey);
    setBusyKey(null);
  };

  const error = [store, retrieve, remove].find((action) => action.status === "error");

  return (
    <div className="cols">
      <form className="panel" onSubmit={onStore}>
        <PanelSection label="Seal private data">
          <div className="stack">
            <Field label="Key">
              <input className="input input--mono" value={key} onChange={(event) => setKey(event.target.value)} />
            </Field>
            <Field label="Data">
              <textarea className="textarea" value={data} onChange={(event) => setData(event.target.value)} maxLength={4000} />
            </Field>
            <Switch
              label="Encrypt with AES-GCM"
              hint={encrypt ? "256-bit key kept in this browser" : "Stored as plaintext"}
              checked={encrypt}
              onChange={setEncrypt}
            />
            <ActionButton type="submit" variant="primary" icon={<LockKey size={16} />} pending={store.pending} block>
              Store in vault
            </ActionButton>
            {store.status === "success" && <Notice tone="success">Sealed “{store.result.key}”.</Notice>}
          </div>
        </PanelSection>
      </form>

      <div className="panel">
        <PanelSection label="Vault" end={<span>{records.length} entries</span>}>
          {error?.status === "error" && <Notice tone="error">{error.error}</Notice>}
          {records.length === 0 ? (
            <Empty>The vault is empty.</Empty>
          ) : (
            <div className="list">
              {records.map((record) => {
                const plaintext = revealed[record.key];
                return (
                  <div key={record.key} className="list__item">
                    <LockKey className="row__icon" size={17} />
                    <span className="row__main" style={{ flex: 1 }}>
                      <span className="mono">{record.key}</span>
                      <span className="row__sub">
                        {formatBytes(record.size)} · {formatRelative(record.updatedAt)}
                      </span>
                      <span className="mono muted break" style={{ marginTop: 4 }}>
                        {plaintext ?? (record.encrypted ? shorten(record.payload, 22, 8) : record.payload)}
                      </span>
                    </span>
                    <span className="row__end">
                      <Chip tone={record.encrypted ? "ok" : "warn"}>{record.encrypted ? "AES-GCM" : "Plain"}</Chip>
                      <ActionButton
                        size="sm"
                        aria-label={plaintext ? `Hide ${record.key}` : `Reveal ${record.key}`}
                        icon={plaintext ? <EyeSlash size={14} /> : <Eye size={14} />}
                        pending={retrieve.pending && busyKey === record.key}
                        onClick={() => (plaintext ? hide(record.key) : void reveal(record.key))}
                      />
                      <ActionButton
                        size="sm"
                        variant="danger"
                        aria-label={`Delete ${record.key}`}
                        icon={<Trash size={14} />}
                        pending={remove.pending && busyKey === record.key}
                        onClick={() => void onDelete(record.key)}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PanelSection>
      </div>
    </div>
  );
}
