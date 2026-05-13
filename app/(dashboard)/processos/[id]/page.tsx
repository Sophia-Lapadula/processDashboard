import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRelative, formatDuration, formatCostUsd } from "@/lib/util/format";
import RunStatusBadge from "@/components/runs/RunStatusBadge";
import TriggersPanel from "@/components/triggers/TriggersPanel";
import SlackDestinationPicker from "@/components/triggers/SlackDestinationPicker";
import ProcessoBuilder from "./ProcessoBuilder";
import RunNowButton from "./RunNowButton";

export default async function ProcessoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: processo } = await supabase
    .from("processos")
    .select("*, skill:skills(id, name), cliente:clientes(id, name)")
    .eq("id", id)
    .single();
  if (!processo) notFound();

  const [
    { data: skills },
    { data: conectores },
    { data: clientes },
    { data: selectedConectorRows },
    { data: recentRuns },
    { data: triggers },
  ] = await Promise.all([
    supabase.from("skills").select("id, name").is("archived_at", null).order("name"),
    supabase
      .from("conectores")
      .select("id, name, type")
      .is("archived_at", null)
      .order("name"),
    supabase.from("clientes").select("id, name").is("archived_at", null).order("name"),
    supabase
      .from("processo_conectores")
      .select("conector_id, ordering")
      .eq("processo_id", id)
      .order("ordering"),
    supabase
      .from("process_runs")
      .select("id, status, duration_ms, cost_usd, created_at, trigger_kind")
      .eq("processo_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("triggers")
      .select("id, kind, enabled, config")
      .eq("processo_id", id)
      .order("kind"),
  ]);

  const { data: slackDestinations } = await supabase
    .from("slack_destinations")
    .select("id, name")
    .eq("enabled", true)
    .order("name");

  const { data: otherProcessosRaw } = await supabase
    .from("processos")
    .select("id, name")
    .is("archived_at", null)
    .neq("id", id)
    .order("name");
  const otherProcessos = otherProcessosRaw ?? [];

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const selectedConectorIds = (selectedConectorRows ?? []).map((r) => r.conector_id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/processos"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Processos
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="serif text-4xl">{processo.name}</h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{processo.slug}</p>
          </div>
          <RunNowButton processoId={id} status={processo.status} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <TriggersPanel
            processoId={id}
            triggers={(triggers ?? []).map((t) => ({
              id: t.id,
              kind: t.kind,
              enabled: t.enabled,
              config: (t.config ?? {}) as Record<string, unknown>,
            }))}
            appUrl={appUrl}
            otherProcessos={otherProcessos}
          />
        </div>
        <SlackDestinationPicker
          processoId={id}
          currentId={processo.slack_destination_id}
          destinations={slackDestinations ?? []}
        />
      </div>

      <ProcessoBuilder
        processoId={id}
        skills={skills ?? []}
        conectores={conectores ?? []}
        clientes={clientes ?? []}
        initial={{
          name: processo.name,
          description: processo.description ?? "",
          skillId: processo.skill_id,
          skillName: (processo as unknown as { skill: { name: string } | null }).skill?.name ?? "",
          clienteId: processo.cliente_id,
          custom_prompt: processo.custom_prompt ?? "",
          model: processo.model,
          max_turns: processo.max_turns,
          max_duration_seconds: processo.max_duration_seconds,
          inputs_schema_json: JSON.stringify(processo.inputs_schema, null, 2),
          default_inputs_json: JSON.stringify(processo.default_inputs, null, 2),
          status: processo.status,
          selected_conector_ids: selectedConectorIds,
        }}
      />

      <div>
        <h2 className="text-lg font-medium mb-3">Últimas execuções</h2>
        <div className="card p-0">
          {recentRuns && recentRuns.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Trigger</th>
                  <th className="text-left px-4 py-2 font-medium">Duração</th>
                  <th className="text-left px-4 py-2 font-medium">Custo</th>
                  <th className="text-left px-4 py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="px-4 py-2">
                      <Link href={`/runs/${r.id}`}>
                        <RunStatusBadge status={r.status} />
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                      {r.trigger_kind}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatDuration(r.duration_ms)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatCostUsd(r.cost_usd)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatRelative(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sem execuções. Clique em &quot;Rodar agora&quot; pra testar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
