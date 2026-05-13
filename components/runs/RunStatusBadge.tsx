import type { ProcessRunStatus } from "@/lib/db/types";

const labels: Record<ProcessRunStatus, string> = {
  queued: "Na fila",
  running: "Rodando",
  succeeded: "Sucesso",
  failed: "Falhou",
  cancelled: "Cancelado",
  timed_out: "Timeout",
};

const classes: Record<ProcessRunStatus, string> = {
  queued: "badge-muted",
  running: "badge-info",
  succeeded: "badge-success",
  failed: "badge-danger",
  cancelled: "badge-muted",
  timed_out: "badge-warning",
};

export default function RunStatusBadge({ status }: { status: string }) {
  const s = status as ProcessRunStatus;
  return <span className={classes[s] ?? "badge-muted"}>{labels[s] ?? status}</span>;
}
