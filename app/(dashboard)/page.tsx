import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative, formatDuration, formatCostUsd } from "@/lib/util/format";
import RunStatusBadge from "@/components/runs/RunStatusBadge";

export default async function OverviewPage() {
  const supabase = await createClient();

  const [skillsCount, conectoresCount, processosCount, runsRecent] = await Promise.all([
    supabase.from("skills").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("conectores").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("processos").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase
      .from("process_runs")
      .select("id, status, duration_ms, cost_usd, created_at, processo_id, processos(name, slug)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="serif text-4xl">Visão geral</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Plataforma de orquestração de processos da Axenya.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Processos" value={processosCount.count ?? 0} href="/processos" />
        <StatCard label="Skills" value={skillsCount.count ?? 0} href="/skills" />
        <StatCard label="Conectores" value={conectoresCount.count ?? 0} href="/conectores" />
      </div>

      <div>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-medium">Últimas execuções</h2>
          <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground">
            ver todas →
          </Link>
        </div>
        <div className="card p-0">
          {runsRecent.data && runsRecent.data.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Processo</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Duração</th>
                  <th className="text-left px-4 py-2 font-medium">Custo</th>
                  <th className="text-left px-4 py-2 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {runsRecent.data.map((run) => {
                  const processo = (run as unknown as { processos: { name: string; slug: string } | null }).processos;
                  return (
                    <tr key={run.id} className="table-row">
                      <td className="px-4 py-2">
                        <Link
                          href={`/runs/${run.id}`}
                          className="font-medium hover:underline"
                        >
                          {processo?.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDuration(run.duration_ms)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatCostUsd(run.cost_usd)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatRelative(run.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma execução ainda. Crie um processo e clique em &quot;Rodar agora&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card hover:bg-accent/50 transition-colors block">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Link>
  );
}
