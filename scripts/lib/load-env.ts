/**
 * Loads .env.local before any app module reads process.env.
 * Import this first in every script. Existing environment variables win,
 * and `--testnet` runs the script against Robinhood Chain Testnet.
 */

import { existsSync } from "node:fs";

if (process.argv.includes("--testnet")) process.env.NEXT_PUBLIC_ROBINHOOD_NETWORK = "testnet";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
