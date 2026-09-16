/**
 * Creates a fresh hot wallet and writes it to a local, git-ignored file.
 * The private key is never printed, so it cannot leak through terminal logs.
 *
 *   npm run wallets:new                       # .env.testnet, facilitator wallet
 *   npm run wallets:new -- --out .env.staging --var X402_FACILITATOR_PRIVATE_KEY
 *   npm run wallets:new -- --force            # overwrite an existing file
 *
 * Copy the value from the file into the hosting provider's environment
 * variables (Vercel: Settings → Environment Variables), then delete the file.
 */

import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};

const file = option("out", ".env.testnet");
const variable = option("var", "X402_FACILITATOR_PRIVATE_KEY");

if (!/^\.env[.\w-]*$/.test(file)) {
  console.error(`Refusing to write to "${file}". Use a .env* file name so it stays git-ignored.`);
  process.exit(1);
}

if (existsSync(file) && !args.includes("--force")) {
  console.error(`${file} already exists. Pass --force to replace it.`);
  process.exit(1);
}

const privateKey = generatePrivateKey();
const { address } = privateKeyToAccount(privateKey);

writeFileSync(
  file,
  [
    `# Hot wallet generated on ${new Date().toISOString().slice(0, 10)} by npm run wallets:new.`,
    "# Copy these values into your hosting provider, then delete this file.",
    "# Never commit it and never reuse this key on another network.",
    `${variable}=${privateKey}`,
    `X402_PAY_TO=${address}`,
    "",
  ].join("\n"),
);

console.log(`Created a new wallet: ${address}`);
console.log(`Private key written to ${file} (git-ignored). It was not printed here.`);
console.log("Next: copy the values into your hosting environment variables, fund the address with a little test ETH, then delete the file.");
