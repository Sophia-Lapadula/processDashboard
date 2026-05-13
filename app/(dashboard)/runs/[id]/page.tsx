import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatDuration, formatCostUsd, formatTokens } from "@/lib/util/format";
import RunStatusBadge from "@/components/runs/RunStatusBadge";
import LiveRunView from "./LiveRunView";
import type { ProcessoSnapshot } from "@/lib/db/types";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("process_runs")
    .select("*, processo:processos(id, name, slug)")
    .eq("id", id)
    .single();
  if (!run) notFound();

  const { data: steps } = await supabase
    .from("run_steps")
    .select("*")
    .eq("run_id", id)
    .order("seq");

  const processo = (run as unknown as { processo: { id: string; name: string; slug: string } | null }).processo;
  const snapshot = run.processo_snapshot as unknown as ProcessoSnapshot;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground">
          ← Execuções
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="serif text-4xl">{processo?.name ?? "—"}</h1>
              <RunStatusBadge status={run.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Disparado por <span className="font-mono">{run.trigger_kind}</span> em{" "}
              {formatDateTime(run.created_at)}
            </p>
            {snapshot?.cliente && (
              <p className="text-xs text-muted-foreground mt-1">
                Cliente: <span className="font-medium">{snapshot.cliente.name}</span>
              </p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <div>Duração: <strong>{formatDuration(run.duration_ms)}</strong></div>
            <div>Custo: <strong>{formatCostUsd(run.cost_usd)}</strong></div>
            <div>
              Tokens: in <strong>{formatTokens(run.input_tokens)}</strong> ·{" "}
              out <strong>{formatTokens(run.output_tokens)}</strong>
            </div>
            <div>
              Skill: <strong className="font-mono">v{snapshot?.skill?.version_number ?? "?"}</strong>
            </div>
          </div>
        </div>
      </div>

      <LiveRunView
        runId={id}
        initialStatus={run.status}
        initialSteps={steps ?? []}
        initialOutput={run.output}
        initialError={run.error}
        initialInputs={run.inputs}
      />
    </div>
  );
}
