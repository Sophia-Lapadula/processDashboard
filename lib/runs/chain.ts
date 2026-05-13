import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueueProcessoRun } from "@/lib/runs/enqueue";
import { dispatchExecute } from "@/lib/runs/dispatch-execute";
import { applyPayloadMapping } from "@/lib/util/jsonpath";
import type { ProcessRun, ProcessRunStatus } from "@/lib/db/types";

const MAX_CHAIN_DEPTH = 10;

interface ChainConfig {
  parent_processo_id: string;
  on: "success" | "failure" | "any";
  input_mapping?: Record<string, string>;
}

/**
 * Procura chain triggers cujo `parent_processo_id` é igual ao processo do run
 * e cuja condição (`on`) bate com o status terminal. Dispara um novo run pra cada match.
 *
 * Guardrails:
 * - chain_depth > MAX_CHAIN_DEPTH → aborta (proteção contra ciclos)
 * - falhas ao disparar um chain não interrompem outros chains
 */
export async function fireChainTriggers(
  parentRun: ProcessRun,
  baseUrl: string,
): Promise<void> {
  if (parentRun.chain_depth >= MAX_CHAIN_DEPTH) {
    console.error(
      `[chain] run ${parentRun.id} atingiu MAX_CHAIN_DEPTH=${MAX_CHAIN_DEPTH}`,
    );
    return;
  }

  const status: ProcessRunStatus = parentRun.status;
  const condCheck = (on: ChainConfig["on"]): boolean => {
    if (on === "any") return true;
    if (on === "success") return status === "succeeded";
    if (on === "failure") return status === "failed" || status === "timed_out";
    return false;
  };

  const service = createServiceClient();
  const { data: chainTriggers } = await service
    .from("triggers")
    .select("id, processo_id, config")
    .eq("kind", "chain")
    .eq("enabled", true)
    .filter("config->>parent_processo_id", "eq", parentRun.processo_id);

  if (!chainTriggers || chainTriggers.length === 0) return;

  const parentOutput = (parentRun.output ?? {}) as Record<string, unknown>;
  const parentText =
    typeof parentOutput.text === "string" ? parentOutput.text : null;

  for (const trigger of chainTriggers) {
    const cfg = trigger.config as ChainConfig;
    if (!condCheck(cfg.on)) continue;

    const mapped = applyPayloadMapping(parentOutput, cfg.input_mapping);
    const childInputs: Record<string, unknown> = {
      ...mapped,
      // sempre injeta texto do parent caso o agente precise
      parent_output_text: parentText,
    };

    const enqueued = await enqueueProcessoRun({
      processoId: trigger.processo_id,
      triggerKind: "chain",
      triggerId: trigger.id,
      triggerPayload: {
        parent_run_id: parentRun.id,
        parent_processo_id: parentRun.processo_id,
        parent_status: status,
      },
      inputs: childInputs,
      parentRunId: parentRun.id,
      chainDepth: parentRun.chain_depth + 1,
    });

    if (!enqueued.ok) {
      console.error(`[chain] falha ao enfileirar ${trigger.id}: ${enqueued.error}`);
      continue;
    }

    dispatchExecute(enqueued.runId, baseUrl);
  }
}
