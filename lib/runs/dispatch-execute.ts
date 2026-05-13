import "server-only";

/**
 * Dispara fire-and-forget a execução de um run via fetch interno.
 * Usado por webhook, cron, chain e o botão "Rodar agora".
 *
 * Não bloqueia o caller. Falhas de fetch são logadas mas não interrompem.
 */
export function dispatchExecute(runId: string, baseUrl: string): void {
  const signingSecret = process.env.PLATFORM_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("[dispatchExecute] PLATFORM_SIGNING_SECRET não configurado");
    return;
  }
  const url = `${baseUrl.replace(/\/$/, "")}/api/runs/${runId}/execute`;
  void fetch(url, {
    method: "POST",
    headers: { "x-platform-signing-secret": signingSecret },
  }).catch((err) => {
    console.error(`[dispatchExecute] runId=${runId}`, err);
  });
}

/**
 * Resolve a base URL absoluta (sem path) a partir de headers de uma request.
 */
export function getBaseUrl(headers: Headers): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl;
  const host = headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
