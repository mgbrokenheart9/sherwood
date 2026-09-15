export const nowIso = (): string => new Date().toISOString();

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Simulated network latency. A scale of 0 resolves immediately (useful for tests). */
export class Latency {
  constructor(private readonly scale = 1) {}

  wait(minMs: number, maxMs: number): Promise<void> {
    if (this.scale <= 0) return Promise.resolve();
    return sleep((minMs + Math.random() * (maxMs - minMs)) * this.scale);
  }
}
