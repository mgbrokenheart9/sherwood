/**
 * ZKx8004 action system: type-safe execution with Zod schema validation.
 */

import { getAddress } from "viem";
import { z } from "zod";
import { CAPABILITY_IDS, CIRCUIT_IDS, EXECUTION_LIMITS, MEMORY_LIMITS } from "./catalog";
import type { ContextId } from "./types";

const text = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);

const address = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{40}$/, `${label} must be a valid 0x address.`)
    .transform((value) => getAddress(value));

const id = (label: string) => z.string().trim().min(1, `${label} is required.`);
const currency = z.enum(["ETH", "USDG"]);
const feePriority = z.enum(["low", "medium", "high"]);
const paymentMethod = z.enum(["x402", "transfer"]);
const noInput = z.object({});

export const actionSchemas = {
  /* wallet */
  connectWallet: z.object({ provider: z.enum(["injected", "demo"]), walletId: z.string().optional() }),
  disconnectWallet: noInput,
  requestAirdrop: z.object({ currency }),
  refreshBalances: noInput,

  /* privacy */
  generateZKProof: z.object({
    statement: text("Statement", 280),
    circuit: z.enum(CIRCUIT_IDS),
    privateInputs: z
      .record(text("Input name", 40), z.string().trim().min(1, "Private input values cannot be empty.").max(500))
      .refine((inputs) => Object.keys(inputs).length > 0, "Add at least one private input."),
  }),
  verifyProof: z.object({
    proof: text("Proof", 200),
    publicInputs: z.array(z.string()),
    verificationKey: text("Verification key", 200),
  }),
  anchorProof: z.object({ proofId: id("Proof") }),
  storePrivateData: z.object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9._-]{2,40}$/i, "Key must be 2–40 characters: letters, numbers, dot, dash or underscore."),
    data: text("Data", 4000),
    encrypt: z.boolean().default(true),
  }),
  retrievePrivateData: z.object({ key: id("Key") }),
  deletePrivateData: z.object({ key: id("Key") }),

  /* payment */
  estimateFees: z.object({
    amount: z.number().nonnegative("Amount cannot be negative."),
    currency,
    method: paymentMethod,
    priority: feePriority,
  }),
  processPayment: z
    .object({
      amount: z.number("Enter an amount.").positive("Amount must be greater than 0.").max(1_000_000, "Amount is too large."),
      currency,
      recipient: address("Recipient"),
      memo: z.string().trim().max(120, "Memo must be at most 120 characters.").optional(),
      priority: feePriority.default("medium"),
      private: z.boolean().default(true),
      method: paymentMethod.default("transfer"),
    })
    .refine((payment) => payment.method !== "x402" || payment.currency === "USDG", {
      message: "x402 authorizations settle in USDG.",
      path: ["method"],
    }),
  purchasePremium: noInput,

  /* blockchain */
  refreshNetworks: noInput,
  deployRegistry: noInput,
  useRegistry: z.object({ address: address("Registry") }),
  executeTransaction: z.object({
    to: address("Destination"),
    data: z.string().trim().max(2000).default(""),
    value: z.number("Enter a value.").min(0, "Value cannot be negative.").max(1_000_000).default(0),
  }),

  /* agents */
  deployAgent: z.object({
    config: z.object({
      name: text("Agent name", 40),
      capabilities: z.array(z.enum(CAPABILITY_IDS)).min(1, "Select at least one capability."),
      privacy: z.boolean().default(true),
      paymentRequired: z.boolean().default(false),
    }),
    deploymentOptions: z
      .object({
        maxMemory: z.enum(MEMORY_LIMITS).default("512MB"),
        maxExecutionTime: z.enum(EXECUTION_LIMITS).default("30s"),
        maxRequests: z.number().int().min(1, "Allow at least one request.").max(100_000).default(1000),
      })
      .default({ maxMemory: "512MB", maxExecutionTime: "30s", maxRequests: 1000 }),
  }),
  agentCommand: z.object({
    agentId: id("Agent"),
    command: z.enum(CAPABILITY_IDS),
    parameters: z.record(z.string(), z.string().trim().max(500)).default({}),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
  }),
  stopAgent: z.object({ agentId: id("Agent"), graceful: z.boolean().default(true) }),
  removeAgent: z.object({ agentId: id("Agent") }),

  /* runtime */
  resetRuntime: noInput,
} satisfies Record<string, z.ZodType>;

export type ActionName = keyof typeof actionSchemas;
export type ActionInput<N extends ActionName> = z.input<(typeof actionSchemas)[N]>;
export type ActionPayload<N extends ActionName> = z.output<(typeof actionSchemas)[N]>;
export type HandlerMap = { [N in ActionName]: (payload: ActionPayload<N>) => Promise<unknown> };

/** Which context owns an action, and whether it is written to the activity log. */
export const ACTION_META: Record<ActionName, { context: ContextId; log: boolean }> = {
  connectWallet: { context: "wallet", log: true },
  disconnectWallet: { context: "wallet", log: true },
  requestAirdrop: { context: "wallet", log: true },
  refreshBalances: { context: "wallet", log: false },
  generateZKProof: { context: "privacy", log: true },
  verifyProof: { context: "privacy", log: true },
  anchorProof: { context: "privacy", log: true },
  storePrivateData: { context: "privacy", log: true },
  retrievePrivateData: { context: "privacy", log: true },
  deletePrivateData: { context: "privacy", log: true },
  estimateFees: { context: "payment", log: false },
  processPayment: { context: "payment", log: true },
  purchasePremium: { context: "payment", log: true },
  refreshNetworks: { context: "blockchain", log: false },
  deployRegistry: { context: "blockchain", log: true },
  useRegistry: { context: "blockchain", log: true },
  executeTransaction: { context: "blockchain", log: true },
  deployAgent: { context: "agents", log: true },
  agentCommand: { context: "agents", log: true },
  stopAgent: { context: "agents", log: true },
  removeAgent: { context: "agents", log: true },
  resetRuntime: { context: "runtime", log: true },
};

export class ActionValidationError extends Error {
  constructor(
    readonly action: ActionName,
    message: string,
  ) {
    super(message);
    this.name = "ActionValidationError";
  }
}

export class ActionExecutor<H extends HandlerMap> {
  constructor(private readonly handlers: H) {}

  list(): ActionName[] {
    return Object.keys(actionSchemas) as ActionName[];
  }

  has(name: string): name is ActionName {
    return name in actionSchemas;
  }

  async execute<N extends ActionName>(name: N, input: ActionInput<N>): Promise<Awaited<ReturnType<H[N]>>> {
    const schema: z.ZodType = actionSchemas[name];
    const parsed = schema.safeParse(input);

    if (!parsed.success) {
      throw new ActionValidationError(name, parsed.error.issues[0]?.message ?? z.prettifyError(parsed.error));
    }

    const handler = this.handlers[name] as unknown as (payload: unknown) => Promise<Awaited<ReturnType<H[N]>>>;
    return handler(parsed.data);
  }
}
