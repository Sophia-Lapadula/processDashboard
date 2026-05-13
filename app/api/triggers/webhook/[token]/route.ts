import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueueProcessoRun } from "@/lib/runs/enqueue";
import { applyPayloadMapping } from "@/lib/util/jsonpath";
import { dispatchExecute, getBaseUrl } from "@/lib/runs/dispatch-execute";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();

  const { data: trigger, error } = await service
    .from("triggers")
    .select("id, processo_id, kind, enabled, config")
    .eq("kind", "webhook")
    .filter("config->>token", "eq", token)
    .single();

  if (error || !trigger) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!trigger.enabled) {
    return NextResponse.json({ error: "trigger_disabled" }, { status: 410 });
  }

  const config = trigger.config as {
    hmac_secret?: string;
    payload_mapping?: Record<string, string>;
  };

  const rawBody = await request.text();

  // Validação HMAC se configurada
  if (config.hmac_secret) {
    const signature = request.headers.get("x-axenya-signature");
    if (!signature) {
      return NextResponse.json({ error: "missing_signature" }, { status: 401 });
    }
    const expected = createHmac("sha256", config.hmac_secret)
      .update(rawBody)
      .digest("hex");
    const provided = signature.replace(/^sha256=/, "");
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  // Idempotency: se Idempotency-Key foi enviado e já temos um run com esse trigger_payload.idempotency_key
  // recente (últimas 24h), retorna ele em vez de criar novo
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from("process_runs")
      .select("id, status")
      .eq("trigger_id", trigger.id)
      .filter("trigger_payload->>idempotency_key", "eq", idempotencyKey)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { run_id: existing.id, status: existing.status, deduplicated: true },
        { status: 200 },
      );
    }
  }

  // Parse body
  let body: unknown;
  try {
    body = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Mapeia inputs
  const inputs = applyPayloadMapping(body, config.payload_mapping);

  // Enfileira
  const enqueued = await enqueueProcessoRun({
    processoId: trigger.processo_id,
    triggerKind: "webhook",
    triggerId: trigger.id,
    triggerPayload: {
      body,
      idempotency_key: idempotencyKey ?? null,
      received_at: new Date().toISOString(),
    },
    inputs,
  });

  if (!enqueued.ok) {
    return NextResponse.json({ error: enqueued.error }, { status: 500 });
  }

  // Dispatch execução (fire-and-forget)
  dispatchExecute(enqueued.runId, getBaseUrl(request.headers));

  return NextResponse.json(
    { run_id: enqueued.runId, status: "queued" },
    { status: 202 },
  );
}
