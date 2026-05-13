import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/util/format";

export default async function ConectoresPage() {
  const supabase = await createClient();
  const { data: conectores } = await supabase
    .from("conectores")
    .select("id, slug, name, description, type, config, updated_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conectores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Integrações usadas pelos processos. MCP servers de clientes ou APIs HTTP.
          </p>
        </div>
        <Link href="/conectores/new" className="btn-primary">
          Novo conector
        </Link>
      </div>

      {!conectores || conectores.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm text-muted-foreground">
            Nenhum conector. Cadastre o MCP do BigQuery do cliente pra começar.
          </p>
        </div>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nome</th>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2 font-medium">URL/Base</th>
                <th className="text-left px-4 py-2 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {conectores.map((c) => {
                const cfg = c.config as { url?: string; base_url?: string };
                return (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-2">
                      <Link href={`/conectores/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">{c.slug}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="badge-info uppercase font-mono text-[10px]">
                        {c.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs truncate max-w-xs">
                      {cfg?.url ?? cfg?.base_url ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatRelative(c.updated_at)}
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
