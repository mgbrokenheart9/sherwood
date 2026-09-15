/**
 * Loads .env.local before any app module reads process.env.
 * Import this first in every script. Existing environment variables win.
 */

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
