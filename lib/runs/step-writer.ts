import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { RunStepKind } from "@/lib/db/types";

/**
 * Acumula steps in-memory e descarrega em batches pra reduzir round-trips.
 * O cliente do dashboard usa Realtime, então inserts em batch são detectados igualmente.
 */
export class StepWriter {
  private seq = 0;
  private buffer: Array<Record<string, unknown>> = [];
  private supabase = createServiceClient();

  constructor(private runId: string) {}

  async write(step: {
    kind: RunStepKind;
    payload?: unknown;
    tool_name?: string | null;
    tool_status?: string | null;
    duration_ms?: number | null;
    tokens_in?: number | null;
    tokens_out?: number | null;
  }) {
    this.seq += 1;
    this.buffer.push({
      run_id: this.runId,
      seq: this.seq,
      kind: step.kind,
      payload: (step.payload as Record<string, unknown>) ?? {},
      tool_name: step.tool_name ?? null,
      tool_status: step.tool_status ?? null,
      duration_ms: step.duration_ms ?? null,
      tokens_in: step.tokens_in ?? null,
      tokens_out: step.tokens_out ?? null,
    });
    // Flush imediato pra que a UI tenha streaming real-time
    await this.flush();
  }

  async flush() {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.slice();
    this.buffer = [];
    const { error } = await this.supabase.from("run_steps").insert(batch);
    if (error) {
      // Não interrompe a execução — só loga
      console.error("[StepWriter] insert failed:", error.message);
      // Re-enfileira pra próxima tentativa
      this.buffer.unshift(...batch);
    }
  }
}

const SENSITIVE_HEADERS = ["authorization", "x-api-key", "cookie", "x-auth-token"];

/**
 * Limpa secret-ish fields de um objeto antes de salvar em run_steps.
 */
export function redactSecrets<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(redactSecrets) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_HEADERS.includes(k.toLowerCase())) {
      result[k] = "[redacted]";
    } else {
      result[k] = redactSecrets(v);
    }
  }
  return result as unknown as T;
}
