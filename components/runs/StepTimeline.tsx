"use client";

import { useState } from "react";
import type { RunStep } from "@/lib/db/types";
import { formatDuration } from "@/lib/util/format";

const kindLabels: Record<string, { label: string; color: string }> = {
  workflow_started: { label: "Início", color: "text-muted-foreground" },
  workflow_ended: { label: "Fim", color: "text-muted-foreground" },
  agent_message: { label: "Resposta", color: "text-foreground" },
  agent_thinking: { label: "Reflexão", color: "text-muted-foreground" },
  tool_call: { label: "Chamada", color: "text-primary" },
  tool_result: { label: "Resultado", color: "text-foreground" },
  mcp_connect: { label: "MCP", color: "text-muted-foreground" },
  mcp_disconnect: { label: "MCP", color: "text-muted-foreground" },
  log: { label: "Log", color: "text-muted-foreground" },
  error: { label: "Erro", color: "text-danger" },
};

export default function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) {
    return (
      <div className="card text-center text-sm text-muted-foreground py-8">
        Sem eventos ainda. Os passos do agente aparecem aqui em tempo real.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <Step key={step.id} step={step} />
      ))}
    </ol>
  );
}

function Step({ step }: { step: RunStep }) {
  const [expanded, setExpanded] = useState(
    step.kind === "agent_message" || step.kind === "error",
  );
  const meta = kindLabels[step.kind] ?? { label: step.kind, color: "text-muted-foreground" };
  const payload = step.payload as Record<string, unknown>;

  return (
    <li className="border-l-2 border-border pl-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="text-xs flex items-baseline gap-2 group"
      >
        <span className="font-mono text-muted-foreground">#{step.seq}</span>
        <span className={`font-medium ${meta.color}`}>{meta.label}</span>
        {step.tool_name && (
          <span className="font-mono text-muted-foreground">{step.tool_name}</span>
        )}
        {step.tool_status === "error" && <span className="badge-danger">erro</span>}
        {step.duration_ms != null && (
          <span className="text-muted-foreground">{formatDuration(step.duration_ms)}</span>
        )}
        <span className="text-muted-foreground group-hover:text-foreground">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && <StepContent step={step} payload={payload} />}
    </li>
  );
}

function StepContent({ step, payload }: { step: RunStep; payload: Record<string, unknown> }) {
  if (step.kind === "agent_message" && typeof payload.text === "string") {
    return (
      <div className="mt-1 text-sm whitespace-pre-wrap leading-relaxed pl-3 border-l border-border/50">
        {payload.text}
      </div>
    );
  }
  if (step.kind === "agent_thinking" && typeof payload.thinking === "string") {
    return (
      <div className="mt-1 text-sm whitespace-pre-wrap italic text-muted-foreground pl-3">
        {payload.thinking}
      </div>
    );
  }
  if (step.kind === "tool_call") {
    return (
      <div className="mt-1 pl-3 space-y-1">
        <div className="text-xs text-muted-foreground">Input:</div>
        <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-48">
          {JSON.stringify(payload.input ?? {}, null, 2)}
        </pre>
      </div>
    );
  }
  if (step.kind === "tool_result") {
    const content = payload.content;
    return (
      <div className="mt-1 pl-3 space-y-1">
        <div className="text-xs text-muted-foreground">Output:</div>
        <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-64">
          {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
        </pre>
      </div>
    );
  }
  if (step.kind === "error") {
    return (
      <div className="mt-1 pl-3 text-sm text-danger font-mono">
        {(payload.name as string) ?? "Error"}: {(payload.message as string) ?? "?"}
      </div>
    );
  }
  return (
    <pre className="mt-1 pl-3 text-xs font-mono text-muted-foreground overflow-auto max-h-32">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
