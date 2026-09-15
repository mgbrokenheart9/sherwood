/**
 * Privacy Context: commitment-based proofs, an AES-GCM private data vault and
 * anchoring of proof commitments in the ZKx8004 registry on Robinhood Chain.
 *
 * Proofs are hash commitments over sealed private inputs. Verification opens
 * the sealed witness and recomputes the commitment, so any tampering with the
 * proof, the verification key or the public inputs is detected.
 */

import { zeroAddress, type Hex } from "viem";
import { NETWORKS } from "@/lib/chain/config";
import { readAnchor } from "@/lib/chain/live";
import { GAS_UNITS, RUNTIME_TUNING } from "../catalog";
import { Vault, createId, randomHex, sha256Hex } from "../crypto";
import { liveTxRef } from "../tx";
import type { CircuitId, ProofAnchor, ProofVerification, VaultRecord, ZKProof } from "../types";
import { nowIso } from "../utils";
import { BaseContext } from "./base";
import type { BlockchainContext } from "./blockchain";
import type { PaymentContext } from "./payment";
import type { WalletContext } from "./wallet";

export interface PrivacyState {
  proofs: ZKProof[];
  vault: VaultRecord[];
}

export interface ProofRequest {
  statement: string;
  circuit: CircuitId;
  privateInputs: Record<string, string>;
}

interface Witness {
  inputs: Record<string, string>;
  salt: string;
}

const sortKeys = (keys: string[]): string[] => [...keys].sort((a, b) => a.localeCompare(b));
const byteSize = (value: string): number => new TextEncoder().encode(value).length;
const asBytes32 = (hex: string): Hex => `0x${hex}`;

/** Pre-images hashed into a proof's commitment and nullifier. Exported for the cross-language test vectors. */
export const commitmentPreimage = (circuit: string, inputs: Record<string, string>, salt: string): string =>
  `commit|${circuit}|${JSON.stringify(inputs)}|${salt}`;

export const nullifierPreimage = (salt: string): string => `nullifier|${salt}`;

export function canonical(inputs: Record<string, string>): Record<string, string> {
  const entries = Object.entries(inputs).map(([key, value]) => [key.trim(), value] as const);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export class PrivacyContext extends BaseContext<PrivacyState> {
  readonly id = "privacy";
  readonly name = "Privacy Context";
  readonly description = "Zero-knowledge proofs and privacy-preserving storage";

  private readonly vault = new Vault(
    () => this.memory.get<JsonWebKey>(this.id, "vaultKey"),
    (jwk) => this.memory.set(this.id, "vaultKey", jwk),
  );

  protected initialState(): PrivacyState {
    return { proofs: [], vault: [] };
  }

  override reset(): void {
    this.vault.forget();
    super.reset();
  }

  private get wallet(): WalletContext {
    return this.dependency<WalletContext>("wallet");
  }

  private get blockchain(): BlockchainContext {
    return this.dependency<BlockchainContext>("blockchain");
  }

  private get payment(): PaymentContext {
    return this.dependency<PaymentContext>("payment");
  }

  private requireProof(proofId: string): ZKProof {
    const proof = this.state.proofs.find((item) => item.id === proofId);
    if (!proof) throw new Error("Proof not found. It may have been removed by a reset.");
    return proof;
  }

  private patchProof(proofId: string, patch: Partial<ZKProof>): ZKProof {
    const proof = { ...this.requireProof(proofId), ...patch };
    this.setState({ proofs: this.state.proofs.map((item) => (item.id === proofId ? proof : item)) });
    return proof;
  }

  private commit(circuit: CircuitId, witness: Witness): Promise<string> {
    return sha256Hex(commitmentPreimage(circuit, witness.inputs, witness.salt));
  }

  private async prove(verificationKey: string, circuit: CircuitId, statement: string): Promise<string> {
    return `zkp_${await sha256Hex(`prove|${verificationKey}|${circuit}|${statement}`)}`;
  }

  async generateProof(request: ProofRequest): Promise<ZKProof> {
    await this.latency.wait(450, 1000);

    const witness: Witness = { inputs: canonical(request.privateInputs), salt: randomHex(32) };
    const verificationKey = await this.commit(request.circuit, witness);

    const proof: ZKProof = {
      id: createId("proof"),
      circuit: request.circuit,
      statement: request.statement,
      proof: await this.prove(verificationKey, request.circuit, request.statement),
      verificationKey,
      nullifier: await sha256Hex(nullifierPreimage(witness.salt)),
      publicInputs: Object.keys(witness.inputs),
      witness: await this.vault.seal(JSON.stringify(witness)),
      verified: null,
      createdAt: nowIso(),
    };

    this.setState({ proofs: [proof, ...this.state.proofs].slice(0, RUNTIME_TUNING.historyLimit) });
    return proof;
  }

  /** Anchor the proof commitment and nullifier in the registry contract. */
  async anchorProof(input: { proofId: string }): Promise<ZKProof> {
    const proof = this.requireProof(input.proofId);
    if (proof.anchor) throw new Error("This proof is already anchored.");

    const wallet = this.wallet.requireWallet();
    const registry = this.blockchain.requireRegistry();
    const live = this.wallet.liveChain();
    let anchor: ProofAnchor;

    if (live) {
      const summary = await live.anchorProof(registry.address, asBytes32(proof.verificationKey), asBytes32(proof.nullifier), proof.circuit);
      anchor = { ...liveTxRef(summary, live.network), registry: registry.address };
    } else {
      this.payment.assertFunds(wallet.address, { ETH: this.blockchain.estimateFee(GAS_UNITS.registryWrite) });
      await this.latency.wait(500, 1000);
      const tx = this.blockchain.simulateTx(GAS_UNITS.registryWrite);
      this.payment.debit(wallet.address, { ETH: tx.fee });
      anchor = { ...tx, registry: registry.address };
    }

    this.blockchain.recordTransaction({
      kind: "anchor",
      from: wallet.address,
      to: registry.address,
      data: `anchorProof(${proof.verificationKey.slice(0, 10)}…)`,
      value: 0,
      tx: anchor,
    });
    return this.patchProof(proof.id, { anchor });
  }

  async verifyProof(input: { proof: string; publicInputs: string[]; verificationKey: string }): Promise<ProofVerification> {
    await this.latency.wait(300, 650);

    const record = this.state.proofs.find((item) => item.proof === input.proof);
    if (!record) return this.verdict(undefined, false, "Proof not recognised. It was altered or never generated here.");

    const witness = JSON.parse(await this.vault.open(record.witness)) as Witness;
    const commitment = await this.commit(record.circuit, witness);
    const expectedProof = await this.prove(commitment, record.circuit, record.statement);

    if (commitment !== input.verificationKey) {
      return this.verdict(record.id, false, "Verification key does not match the sealed commitment.");
    }
    if (expectedProof !== record.proof) {
      return this.verdict(record.id, false, "Proof does not open the commitment.");
    }
    if (sortKeys(input.publicInputs).join("|") !== sortKeys(record.publicInputs).join("|")) {
      return this.verdict(record.id, false, "Public inputs do not match the circuit.");
    }

    if (!record.anchor) return this.verdict(record.id, true, "Commitment opened and proof matched.");
    if (record.anchor.mode === "demo" || !this.options.rpc) {
      return this.verdict(record.id, true, "Commitment opened, proof matched and anchor recorded.", true);
    }

    try {
      const anchor = await readAnchor(NETWORKS[record.anchor.network], record.anchor.registry, asBytes32(record.verificationKey));
      if (anchor.owner === zeroAddress || anchor.nullifier !== asBytes32(record.nullifier)) {
        return this.verdict(record.id, false, "The on-chain anchor is missing or its nullifier differs.", false);
      }
      return this.verdict(record.id, true, "Commitment opened, proof matched and anchor confirmed on Robinhood Chain.", true);
    } catch {
      return this.verdict(record.id, true, "Commitment opened and proof matched. The on-chain anchor could not be read right now.");
    }
  }

  private verdict(proofId: string | undefined, verified: boolean, reason: string, anchored?: boolean): ProofVerification {
    const checkedAt = nowIso();
    if (proofId) this.patchProof(proofId, { verified, verifiedAt: checkedAt });
    return { proofId, verified, anchored, reason, checkedAt };
  }

  async storePrivateData(input: { key: string; data: string; encrypt: boolean }): Promise<VaultRecord> {
    await this.latency.wait(200, 450);

    const now = nowIso();
    const existing = this.state.vault.find((record) => record.key === input.key);
    const sealed = input.encrypt ? await this.vault.seal(input.data) : undefined;

    const record: VaultRecord = {
      key: input.key,
      encrypted: input.encrypt,
      iv: sealed?.iv,
      payload: sealed?.ciphertext ?? input.data,
      size: byteSize(input.data),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.setState({ vault: [record, ...this.state.vault.filter((item) => item.key !== input.key)] });
    return record;
  }

  async retrievePrivateData(input: { key: string }): Promise<{ key: string; data: string; encrypted: boolean }> {
    const record = this.state.vault.find((item) => item.key === input.key);
    if (!record) throw new Error(`No private data stored under "${input.key}".`);

    const data = record.encrypted && record.iv ? await this.vault.open({ iv: record.iv, ciphertext: record.payload }) : record.payload;
    return { key: record.key, data, encrypted: record.encrypted };
  }

  async deletePrivateData(input: { key: string }): Promise<{ key: string; deleted: true }> {
    if (!this.state.vault.some((item) => item.key === input.key)) {
      throw new Error(`No private data stored under "${input.key}".`);
    }
    this.setState({ vault: this.state.vault.filter((item) => item.key !== input.key) });
    return { key: input.key, deleted: true };
  }
}
