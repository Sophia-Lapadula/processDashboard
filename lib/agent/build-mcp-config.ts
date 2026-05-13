import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, bytesToBuffer } from "@/lib/secrets/crypto";
import type { McpConfig, McpSecretPayload, ProcessoSnapshot } from "@/lib/db/types";
import type Anthropic from "@anthropic-ai/sdk";

type McpServerDef = Anthropic.Beta.BetaRequestMCPServerURLDefinition;

/**
 * A partir do snapshot, monta os mcp_servers que serão enviados pra Anthropic API.
 * Os secrets dos conectores são decriptados aqui.
 *
 * Retorna apenas conectores tipo 'mcp'. HTTP API conectores são tratados em outro lugar.
 */
export async function buildMcpServers(
  snapshot: ProcessoSnapshot,
): Promise<{ servers: McpServerDef[]; warnings: string[] }> {
  const service = createServiceClient();
  const servers: McpServerDef[] = [];
  const warnings: string[] = [];

  const mcpConectores = snapshot.conectores.filter((c) => c.type === "mcp");
  if (mcpConectores.length === 0) {
    return { servers, warnings };
  }

  // Carrega secrets dos conectores MCP
  const conectorIds = mcpConectores.map((c) => c.id);
  const { data: conectorRows } = await service
    .from("conectores")
    .select("id, secrets_id, config")
    .in("id", conectorIds);

  const secretsIds = (conectorRows ?? [])
    .map((r) => r.secrets_id)
    .filter((id): id is string => !!id);

  const secretMap = new Map<string, McpSecretPayload>();
  if (secretsIds.length > 0) {
    const { data: secretRows } = await service
      .from("conector_secrets")
      .select("id, encrypted_payload, key_version")
      .in("id", secretsIds);

    for (const row of secretRows ?? []) {
      try {
        const buf = bytesToBuffer(row.encrypted_payload);
        const payload = decryptSecret<McpSecretPayload>(buf, row.key_version);
        secretMap.set(row.id, payload);
      } catch (err) {
        warnings.push(`Falha ao decriptar secret ${row.id}: ${(err as Error).message}`);
      }
    }
  }

  const conectorById = new Map((conectorRows ?? []).map((r) => [r.id, r]));

  for (const con of mcpConectores) {
    const row = conectorById.get(con.id);
    if (!row) {
      warnings.push(`Conector ${con.slug} não encontrado no DB`);
      continue;
    }

    const config = (con.config_override ?? row.config) as McpConfig;
    const secret = row.secrets_id ? secretMap.get(row.secrets_id) : undefined;

    const server: McpServerDef = {
      type: "url",
      name: con.slug,
      url: config.url,
    };

    if (secret?.authorization_token) {
      server.authorization_token = secret.authorization_token;
    }

    if (config.tool_allowlist && config.tool_allowlist.length > 0) {
      server.tool_configuration = {
        enabled: true,
        allowed_tools: config.tool_allowlist,
      };
    }

    servers.push(server);
  }

  return { servers, warnings };
}
