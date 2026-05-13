"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/current-user";
import { enqueueProcessoRun } from "@/lib/runs/enqueue";
import { dispatchExecute, getBaseUrl } from "@/lib/runs/dispatch-execute";

export type RunActionResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

export async function runProcessoNow(
  processoId: string,
  inputs: Record<string, unknown> | null,
): Promise<RunActionResult> {
  const user = await requireUser();
  const enqueued = await enqueueProcessoRun({
    processoId,
    triggerKind: "manual",
    inputs: inputs ?? undefined,
    actorId: user.id,
  });
  if (!enqueued.ok) {
    return { ok: false, error: enqueued.error };
  }

  const h = await headers();
  dispatchExecute(enqueued.runId, getBaseUrl(h));

  revalidatePath(`/processos/${processoId}`);
  return { ok: true, runId: enqueued.runId };
}

export async function cancelRun(_runId: string): Promise<{ ok: boolean }> {
  // TODO: implementar cancelamento (Fase 4)
  return { ok: false };
}
