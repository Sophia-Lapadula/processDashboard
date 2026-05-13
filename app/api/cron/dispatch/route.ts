import { NextResponse, type NextRequest } from "next/server";
import { CronExpressionParser } from "cron-parser";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueueProcessoRun } from "@/lib/runs/enqueue";
import { dispatchExecute, getBaseUrl } from "@/lib/runs/dispatch-execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CronTriggerRow {
  id: string;
  processo_id: string;
  config: {
    cron_expression: string;
    timezone?: string;
    static_inputs?: Record<string, unknown>;
  };
}

/**
 * Endpoint chamado pelo Vercel Cron (configurado em vercel.json) a cada minuto.
 * Data-driven: lê triggers cron ativos, verifica quais devem disparar agora,
 * insere uma linha em `cron_dispatches` (unique por trigger+minuto) pra evitar
 * double-fire, e enfileira o run.
 */
export async function GET(request: NextRequest) {
  // Auth: Vercel Cron envia header `Authorization: Bearer ${CRON_SECRET}`
  // OU aceita PLATFORM_SIGNING_SECRET pra rodar manualmente
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const platformSecret = process.env.PLATFORM_SIGNING_SECRET;
  const validBearer = cronSecret ? `Bearer ${cronSecret}` : null;
  const validPlatform = platformSecret ? `Bearer ${platformSecret}` : null;

  if (
    authHeader !== validBearer &&
    authHeader !== validPlatform &&
    request.headers.get("x-platform-signing-secret") !== platformSecret
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: triggers, error } = await service
    .from("triggers")
    .select("id, processo_id, config")
    .eq("kind", "cron")
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  // Janela: avalia se algum disparo do cron caiu nos últimos 90s.
  // Cron mestre roda a cada minuto, então 90s cobre eventual atraso/skew.
  const windowStart = new Date(now.getTime() - 90 * 1000);
  const baseUrl = getBaseUrl(request.headers);

  const dispatched: Array<{ trigger_id: string; run_id: string; fire_minute: string }> = [];
  const skipped: Array<{ trigger_id: string; reason: string }> = [];

  for (const row of (triggers ?? []) as CronTriggerRow[]) {
    const expr = row.config.cron_expression;
    const tz = row.config.timezone ?? "America/Sao_Paulo";

    let fireDate: Date | null = null;
    try {
      const interval = CronExpressionParser.parse(expr, {
        currentDate: windowStart,
        endDate: now,
        tz,
      });
      // pega o primeiro fire dentro da janela
      if (interval.hasNext()) {
        const next = interval.next();
        fireDate = next.toDate();
      }
    } catch (err) {
      skipped.push({ trigger_id: row.id, reason: `parse_error: ${(err as Error).message}` });
      continue;
    }

    if (!fireDate || fireDate > now) {
      // não deveria disparar nesta janela
      continue;
    }

    // Trunca pro minuto (chave de dedup)
    const fireMinute = new Date(fireDate);
    fireMinute.setSeconds(0, 0);
    const fireMinuteIso = fireMinute.toISOString();

    // Tenta inserir em cron_dispatches (unique constraint previne duplo)
    const { error: dupErr } = await service.from("cron_dispatches").insert({
      trigger_id: row.id,
      fire_minute: fireMinuteIso,
    });
    if (dupErr) {
      if (dupErr.code === "23505") {
        skipped.push({ trigger_id: row.id, reason: "already_dispatched" });
        continue;
      }
      skipped.push({ trigger_id: row.id, reason: dupErr.message });
      continue;
    }

    // Enfileira
    const enqueued = await enqueueProcessoRun({
      processoId: row.processo_id,
      triggerKind: "cron",
      triggerId: row.id,
      triggerPayload: { fire_minute: fireMinuteIso, expression: expr, timezone: tz },
      inputs: row.config.static_inputs,
    });

    if (!enqueued.ok) {
      skipped.push({ trigger_id: row.id, reason: `enqueue_failed: ${enqueued.error}` });
      continue;
    }

    dispatchExecute(enqueued.runId, baseUrl);
    dispatched.push({ trigger_id: row.id, run_id: enqueued.runId, fire_minute: fireMinuteIso });
  }

  return NextResponse.json({
    now: now.toISOString(),
    dispatched,
    skipped,
  });
}

// Permite POST com mesma lógica pra debug manual via curl
export const POST = GET;
