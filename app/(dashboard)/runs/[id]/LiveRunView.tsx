"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import StepTimeline from "@/components/runs/StepTimeline";
import type { RunStep, ProcessRunStatus } from "@/lib/db/types";

interface Props {
  runId: string;
  initialStatus: ProcessRunStatus;
  initialSteps: RunStep[];
  initialOutput: unknown;
  initialError: unknown;
  initialInputs: unknown;
}

export default function LiveRunView({
  runId,
  initialStatus,
  initialSteps,
  initialOutput,
  initialError,
  initialInputs,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ProcessRunStatus>(initialStatus);
  const [steps, setSteps] = useState<RunStep[]>(initialSteps);
  const [output, setOutput] = useState<unknown>(initialOutput);
  const [error, setError] = useState<unknown>(initialError);

  useEffect(() => {
    const TERMINAL: ProcessRunStatus[] = ["succeeded", "failed", "cancelled", "timed_out"];
    if (TERMINAL.includes(status)) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "run_steps", filter: `run_id=eq.${runId}` },
        (payload) => {
          const newStep = payload.new as RunStep;
          setSteps((curr) => {
            if (curr.some((s) => s.id === newStep.id)) return curr;
            const next = [...curr, newStep];
            next.sort((a, b) => a.seq - b.seq);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "process_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const row = payload.new as {
            status: ProcessRunStatus;
            output: unknown;
            error: unknown;
          };
          setStatus(row.status);
          if (row.output != null) setOutput(row.output);
          if (row.error != null) setError(row.error);
          if (TERMINAL.includes(row.status)) {
            // dispara refresh do server component pra atualizar header (duração/custo)
            router.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, status, router]);

  const isRunning = status === "running" || status === "queued";
  const errorObj = error as { message?: string; name?: string } | null;
  const outputText = (output as { text?: string; stop_reason?: string; turns?: number } | null)?.text;
  const inputsObj = initialInputs as Record<string, unknown> | null;

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Timeline</h3>
            {isRunning && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Atualizando ao vivo
              </span>
            )}
          </div>
          <StepTimeline steps={steps} />
        </div>

        {outputText && (
          <div>
            <h3 className="text-sm font-medium mb-2">Output final</h3>
            <div className="card">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                {outputText}
              </pre>
            </div>
          </div>
        )}

        {errorObj && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-danger">Erro</h3>
            <div className="card border-danger/30 bg-danger/5">
              <div className="text-sm font-mono text-danger">
                {errorObj.name && <span className="font-semibold">{errorObj.name}: </span>}
                {errorObj.message}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {inputsObj && Object.keys(inputsObj).length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Inputs</h3>
            <div className="card">
              <pre className="text-xs font-mono overflow-auto max-h-64">
                {JSON.stringify(inputsObj, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
