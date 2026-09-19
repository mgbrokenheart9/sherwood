const LOCALE = "en-US";

export function shorten(value: string, head = 4, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatAmount(value: number, currency?: string, maxDecimals = 6): string {
  const formatted = value.toLocaleString(LOCALE, { maximumFractionDigits: maxDecimals });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** Confirmation times on a 100 ms chain are usually milliseconds, so only seconds get a decimal. */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}
