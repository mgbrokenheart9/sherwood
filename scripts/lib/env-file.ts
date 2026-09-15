import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const ENV_FILE = ".env.local";

/** Insert or replace KEY=value lines in .env.local, keeping every other line intact. */
export function upsertEnv(values: Record<string, string>, file = ENV_FILE): void {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values));

  const next = lines.map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    const value = key === undefined ? undefined : pending.get(key);
    if (key === undefined || value === undefined) return line;
    pending.delete(key);
    return `${key}=${value}`;
  });

  while (next.length > 0 && next[next.length - 1] === "") next.pop();
  for (const [key, value] of pending) next.push(`${key}=${value}`);

  writeFileSync(file, `${next.join("\n")}\n`);
  Object.assign(process.env, values);
}
