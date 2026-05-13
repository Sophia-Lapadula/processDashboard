import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative, formatDuration, formatCostUsd } from "@/lib/util/format";
import RunStatusBadge from "@/components/runs/RunStatusBadge";

export default async function RunsListPage() {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("process_runs")
    .select(
      "id, status, trigger_kind, duration_ms, cost_usd, created_at, processo:processos(id, name, slug, cliente:clientes(name))",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Execuções</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Últimas 100 execuções de todos os processos.
        </p>
      </div>

      <div className="card p-0">
        {!runs || runs.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhuma execução. Rode um processo pra começar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Processo</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Trigger</th>
                <th className="text-left px-4 py-2 font-medium">Duração</th>
                <th className="text-left px-4 py-2 font-medium">Custo</th>
                <th className="text-left px-4 py-2 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const p = (r as unknown as {
                  processo: { id: string; name: string; cliente: { name: string } | null } | null;
                }).processo;
                return (
                  <tr key={r.id} className="table-row">
                    <td className="px-4 py-2">
                      <Link href={`/runs/${r.id}`} className="font-medium hover:underline">
                        {p?.name ?? "—"}
                      </Link>
                      {p?.cliente && (
                        <div className="text-xs text-muted-foreground">
                          {p.cliente.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <RunStatusBadge status={r.status} />
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
