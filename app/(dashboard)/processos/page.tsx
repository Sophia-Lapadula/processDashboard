import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/util/format";

export default async function ProcessosPage() {
  const supabase = await createClient();
  const { data: processos } = await supabase
    .from("processos")
    .select(
      "id, slug, name, status, cliente_id, updated_at, skill:skills(name), cliente:clientes(name)",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Processos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada processo combina uma skill + conectores + prompt + trigger.
          </p>
        </div>
        <Link href="/processos/new" className="btn-primary">
          Novo processo
        </Link>
      </div>

      {!processos || processos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm text-muted-foreground">
            Nenhum processo ainda. Crie skill + conector e depois um processo.
          </p>
        </div>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nome</th>
                <th className="text-left px-4 py-2 font-medium">Skill</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {processos.map((p) => {
                const skill = (p as unknown as { skill: { name: string } | null }).skill;
                const cliente = (p as unknown as { cliente: { name: string } | null }).cliente;
                return (
                  <tr key={p.id} className="table-row">
                    <td className="px-4 py-2">
                      <Link
                        href={`/processos/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">{p.slug}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{skill?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{cliente?.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatRelative(p.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "badge-muted",
    active: "badge-success",
    paused: "badge-warning",
  };
  const labels: Record<string, string> = {
    draft: "Rascunho",
    active: "Ativo",
    paused: "Pausado",
  };
  return <span className={map[status] ?? "badge-muted"}>{labels[status] ?? status}</span>;
}
