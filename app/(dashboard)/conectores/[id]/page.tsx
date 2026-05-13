import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { McpConfig, HttpApiConfig } from "@/lib/db/types";
import EditConectorForm from "./EditConectorForm";
import EditLogList from "@/components/audit/EditLogList";

function HttpApiSummary({ config, hasSecret }: { config: HttpApiConfig; hasSecret: boolean }) {
  return (
    <div className="card space-y-3">
      <p className="text-xs text-muted-foreground">
        Edição completa de HTTP API conectores ainda não está disponível na UI. Os dados abaixo
        são read-only. (Recriar pra alterações grandes.)
      </p>
      <div>
        <div className="text-xs text-muted-foreground">Base URL</div>
        <code className="block bg-muted rounded px-2 py-1 font-mono text-xs break-all">
          {config.base_url}
        </code>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Auth</div>
        <div className="text-xs">
          <span className="font-mono">{config.auth_type}</span>
          {hasSecret && <span className="ml-2 text-success">(credenciais configuradas)</span>}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Endpoints ({config.endpoints?.length ?? 0})
        </div>
        <ul className="space-y-1 text-xs">
          {(config.endpoints ?? []).map((e) => (
            <li key={e.name} className="border rounded px-2 py-1 font-mono">
              <span className="font-semibold">{e.method}</span>{" "}
              <span className="text-muted-foreground">{e.path}</span>
              <span className="ml-2 font-sans text-muted-foreground">→ {e.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default async function ConectorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: conector } = await supabase
    .from("conectores")
    .select("*")
    .eq("id", id)
    .single();
  if (!conector) notFound();

  const hasSecret = !!conector.secrets_id;
  // Não decriptamos pra mostrar — só sinalizamos se existe
  void service; // marcador, secrets são lidos apenas no runtime de execução

  const { data: editLogs } = await supabase
    .from("edit_logs")
    .select("*")
    .eq("entity_type", "conector")
    .eq("entity_id", id)
    .order("ts", { ascending: false })
    .limit(20);

  const { data: usingProcessos } = await supabase
    .from("processo_conectores")
    .select("processo:processos(id, name, slug)")
    .eq("conector_id", id);

  const config =
    conector.type === "mcp"
      ? (conector.config as McpConfig)
      : ({} as McpConfig);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/conectores" className="text-xs text-muted-foreground hover:text-foreground">
          ← Conectores
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold">{conector.name}</h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {conector.slug} <span className="ml-2 uppercase badge-info">{conector.type}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {conector.type === "mcp" ? (
            <EditConectorForm
              conectorId={id}
              initial={{
                name: conector.name,
                description: conector.description ?? "",
                url: config.url,
                transport: config.transport ?? "http",
                tool_allowlist: (config.tool_allowlist ?? []).join(", "),
                extra_headers_json: config.headers ? JSON.stringify(config.headers, null, 2) : "",
                hasSecret,
              }}
            />
          ) : (
            <HttpApiSummary config={conector.config as HttpApiConfig} hasSecret={hasSecret} />
          )}
        </div>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Usado por</h3>
            {usingProcessos && usingProcessos.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {usingProcessos.map((row, i) => {
                  const p = (row as unknown as { processo: { id: string; name: string; slug: string } | null }).processo;
                  if (!p) return null;
                  return (
                    <li key={i}>
                      <Link href={`/processos/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum processo.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Log de edição</h3>
            <EditLogList logs={editLogs ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
