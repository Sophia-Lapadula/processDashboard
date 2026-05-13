import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { buildProcessoSnapshot } from "@/lib/agent/build-snapshot";
import type { TriggerKind } from "@/lib/db/types";

export interface EnqueueParams {
  processoId: string;
  triggerKind: TriggerKind;
  triggerId?: string | null;
  triggerPayload?: unknown;
  inputs?: Record<string, unknown>;
  actorId?: string | null;
  parentRunId?: string | null;
  chainDepth?: number;
}

export interface EnqueueResult {
  ok: true;
  runId: string;
}

export interface EnqueueError {
  ok: false;
  error: string;
}

/**
 * Cria um process_run com snapshot completo e status='queued'.
 * Não dispara a execução — quem chama é responsável por isso.
 */
export async function enqueueProcessoRun(
  params: EnqueueParams,
): Promise<EnqueueResult | EnqueueError> {
  const service = createServiceClient();

  const snapshotResult = await buildProcessoSnapshot(params.processoId);
  if ("error" in snapshotResult) {
    return { ok: false, error: snapshotResult.error };
  }
  const { snapshot, skillVersionId } = snapshotResult;

  // Merge default_inputs + inputs passados
  const inputs = {
    ...(snapshot.processo.default_inputs as Record<string, unknown>),
    ...(params.inputs ?? {}),
  };

  const { data, error } = await service
    .from("process_runs")
    .insert({
      processo_id: params.processoId,
      processo_snapshot: snapshot as unknown as Record<string, unknown>,
      skill_version_id: skillVersionId,
      trigger_id: params.triggerId ?? null,
      trigger_kind: params.triggerKind,
      trigger_payload: (params.triggerPayload as Record<string, unknown>) ?? null,
      inputs,
      status: "queued",
      parent_run_id: params.parentRunId ?? null,
      chain_depth: params.chainDepth ?? 0,
      created_by: params.actorId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao criar run" };
  }

  return { ok: true, runId: data.id };
}
