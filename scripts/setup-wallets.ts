/**
 * Prepares .env.local for mainnet: selects the network and creates dedicated
 * hot wallets for the x402 facilitator and the end-to-end payer when missing.
 * Existing keys are never overwritten and private keys are never printed.
 *
 * Run with: npm run wallets:setup
 */

import "./lib/load-env";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ENV_FILE, upsertEnv } from "./lib/env-file";

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

function ensureKey(name: string, updates: Record<string, string>): { address: string; created: boolean } {
  const existing = process.env[name];
  if (existing && PRIVATE_KEY.test(existing)) {
    return { address: privateKeyToAccount(existing as `0x${string}`).address, created: false };
  }
  const key = generatePrivateKey();
  updates[name] = key;
  return { address: privateKeyToAccount(key).address, created: true };
}

const updates: Record<string, string> = {};
if (!process.env.NEXT_PUBLIC_ROBINHOOD_NETWORK) updates.NEXT_PUBLIC_ROBINHOOD_NETWORK = "mainnet";

const facilitator = ensureKey("X402_FACILITATOR_PRIVATE_KEY", updates);
const payer = ensureKey("E2E_PAYER_PRIVATE_KEY", updates);
if (!process.env.X402_PAY_TO) updates.X402_PAY_TO = facilitator.address;
if (!process.env.X402_PRICE_USDG) updates.X402_PRICE_USDG = "0.01";

if (Object.keys(updates).length > 0) upsertEnv(updates);

const network = process.env.NEXT_PUBLIC_ROBINHOOD_NETWORK ?? updates.NEXT_PUBLIC_ROBINHOOD_NETWORK;
console.log(`${ENV_FILE} ready · network: ${network}`);
console.log(`Facilitator (pays gas for x402 settlement): ${facilitator.address}${facilitator.created ? " (new)" : ""}`);
console.log(`E2E payer (pays USDG and registry gas):      ${payer.address}${payer.created ? " (new)" : ""}`);
console.log(`x402 merchant (X402_PAY_TO):                 ${process.env.X402_PAY_TO}`);
console.log("\nThese are hot wallets stored in plain text in .env.local. Fund them with small amounts only.");
