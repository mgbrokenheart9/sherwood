/**
 * Browser-native cryptography helpers built on the Web Crypto API.
 * No Node `Buffer` usage, so everything runs in the browser and on the edge.
 */

import { getAddress, type Address, type Hex } from "viem";
import type { SealedPayload } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto is unavailable. Open the site over HTTPS or on localhost.");
  }
  return crypto.subtle;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomHex(byteLength: number): string {
  return toHex(randomBytes(byteLength));
}

/** Random checksummed EVM address (demo mode and test recipients). */
export function randomAddress(): Address {
  return getAddress(`0x${randomHex(20)}`);
}

/** Random 32-byte hash used for simulated transactions. */
export function randomTxHash(): Hex {
  return `0x${randomHex(32)}`;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomHex(3)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await subtle().digest("SHA-256", encoder.encode(input)));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * AES-GCM vault. The key is created once and persisted as a JWK through the
 * supplied callbacks, so sealed data survives reloads in the same browser.
 */
export class Vault {
  private keyPromise?: Promise<CryptoKey>;

  constructor(
    private readonly loadKey: () => JsonWebKey | undefined,
    private readonly saveKey: (jwk: JsonWebKey) => void,
  ) {}

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= this.resolveKey();
    return this.keyPromise;
  }

  private async resolveKey(): Promise<CryptoKey> {
    const stored = this.loadKey();
    if (stored) {
      return subtle().importKey("jwk", stored, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    }
    const key = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    this.saveKey(await subtle().exportKey("jwk", key));
    return key;
  }

  async seal(plaintext: string): Promise<SealedPayload> {
    const iv = randomBytes(12);
    const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, await this.key(), encoder.encode(plaintext));
    return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  }

  async open(sealed: SealedPayload): Promise<string> {
    try {
      const plaintext = await subtle().decrypt(
        { name: "AES-GCM", iv: fromBase64(sealed.iv) },
        await this.key(),
        fromBase64(sealed.ciphertext),
      );
      return decoder.decode(plaintext);
    } catch {
      throw new Error("Decryption failed. The payload was tampered with or sealed by another vault key.");
    }
  }

  /** Forget the cached key, e.g. after the runtime has been reset. */
  forget(): void {
    this.keyPromise = undefined;
  }
}
