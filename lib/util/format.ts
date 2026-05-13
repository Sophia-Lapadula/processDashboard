export function formatDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const date = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatRelative(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const date = typeof ts === "string" ? new Date(ts) : ts;
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d atrás`;
  return formatDateTime(date);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec - min * 60);
  return `${min}m ${remSec}s`;
}

export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
