import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { composeSystemPrompt } from "@/lib/agent/compose-prompt";
import { buildMcpServers } from "@/lib/agent/build-mcp-config";
import { buildHttpTools, type HttpToolHandler } from "@/lib/agent/build-http-tools";
import { StepWriter, redactSecrets } from "./step-writer";
import { computeCostUsd } from "@/lib/costs/model-rates";
import { notifyRunCompleted } from "@/lib/slack/notify";
import { fireChainTriggers } from "@/lib/runs/chain";
import { dispatchExecute } from "@/lib/runs/dispatch-execute";
import type {
  ProcessoSnapshot,
  ProcessRun,
} from "@/lib/db/types";

const MCP_BETA = "mcp-client-2025-04-04";

interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

/**
 * Executa um process_run que já existe no banco em status='queued'.
 * Marca como 'running', roda o agente, finaliza com status terminal.
 *
 * Idempotente: se o run já está em status terminal, retorna sem fazer nada.
 */
export async function executeRun(runId: string): Promise<void> {
  const service = createServiceClient();
  const writer = new StepWriter(runId);

  const { data: run, error: loadErr } = await service
    .from("process_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (loadErr || !run) {
    throw new Error(`Run não encontrado: ${loadErr?.message ?? runId}`);
  }

  // Idempotência
  const TERMINAL = ["succeeded", "failed", "cancelled", "timed_out"];
  if (TERMINAL.includes(run.status)) {
    return;
  }
  if (run.status === "running") {
    // Outra execução já está rolando — não dispara concorrente
    return;
  }

  const typedRun = run as ProcessRun;
  const snapshot = typedRun.processo_snapshot as unknown as ProcessoSnapshot;
  const inputs = typedRun.inputs as Record<string, unknown>;
  const startedAt = new Date();

  // Marca como running
  await service
    .from("process_runs")
    .update({
      status: "running",
      started_at: startedAt.toISOString(),
    })
    .eq("id", runId)
    .eq("status", "queued"); // só transiciona de queued (proteção concorrência)

  await writer.write({
    kind: "workflow_started",
    payload: {
      processo_id: typedRun.processo_id,
      skill_version_id: typedRun.skill_version_id,
      model: snapshot.processo.model,
    },
  });

  const totals: UsageTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
  };

  try {
    // Monta config MCP
    const { servers: mcpServers, warnings: mcpWarnings } = await buildMcpServers(snapshot);
    const { tools: httpTools, handlers: httpHandlers, warnings: httpWarnings } =
      await buildHttpTools(snapshot);
    for (const w of [...mcpWarnings, ...httpWarnings]) {
      await writer.write({ kind: "log", payload: { level: "warn", message: w } });
    }
    for (const s of mcpServers) {
      await writer.write({
        kind: "mcp_connect",
        payload: redactSecrets({ name: s.name, url: s.url }),
        tool_name: s.name,
      });
    }
    if (httpTools.length > 0) {
      await writer.write({
        kind: "log",
        payload: {
          level: "info",
          message: `HTTP API tools disponíveis: ${httpTools.length}`,
          tool_names: httpTools.map((t) => t.name),
        },
      });
    }

    const systemPrompt = composeSystemPrompt(snapshot, inputs);
    const initialUserMessage = buildInitialUserMessage(snapshot, inputs);

    await writer.write({
      kind: "log",
      payload: {
        level: "info",
        message: "Iniciando turno 1",
        system_prompt_chars: systemPrompt.length,
      },
    });

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const messages: Array<Anthropic.Beta.BetaMessageParam> = [
      { role: "user", content: initialUserMessage },
    ];

    const deadlineMs = startedAt.getTime() + snapshot.processo.max_duration_seconds * 1000;
    let finalText: string | null = null;
    let stopReason: string | null = null;
    let turn = 0;

    while (turn < snapshot.processo.max_turns) {
      turn += 1;

      if (Date.now() > deadlineMs) {
        throw new TimeoutError(`Excedeu max_duration_seconds=${snapshot.processo.max_duration_seconds}`);
      }

      const turnStart = Date.now();
      const response = await anthropic.beta.messages.create({
        model: snapshot.processo.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        ...(httpTools.length > 0 ? { tools: httpTools } : {}),
        ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
        betas: mcpServers.length > 0 ? [MCP_BETA] : undefined,
      });
      const turnDuration = Date.now() - turnStart;

      // Acumula usage
      totals.input_tokens += response.usage.input_tokens ?? 0;
      totals.output_tokens += response.usage.output_tokens ?? 0;
      totals.cache_read_tokens += response.usage.cache_read_input_tokens ?? 0;
      totals.cache_creation_tokens += response.usage.cache_creation_input_tokens ?? 0;

      // Persiste cada bloco de conteúdo como step
      for (const block of response.content) {
        if (block.type === "text") {
          await writer.write({
            kind: "agent_message",
            payload: { text: block.text },
            tokens_in: response.usage.input_tokens ?? null,
            tokens_out: response.usage.output_tokens ?? null,
            duration_ms: turnDuration,
          });
        } else if (block.type === "thinking") {
          await writer.write({
            kind: "agent_thinking",
            payload: { thinking: block.thinking },
          });
        } else if (block.type === "tool_use" || block.type === "mcp_tool_use") {
          const toolName = "name" in block ? block.name : "unknown";
          const serverName =
            "server_name" in block && typeof block.server_name === "string"
              ? block.server_name
              : null;
          await writer.write({
            kind: "tool_call",
            tool_name: serverName ? `${serverName}.${toolName}` : toolName,
            payload: redactSecrets({
              tool_name: toolName,
              server_name: serverName,
              input: block.input,
              id: block.id,
            }),
          });
        } else if (block.type === "mcp_tool_result") {
          await writer.write({
            kind: "tool_result",
            tool_name: null,
            tool_status: block.is_error ? "error" : "ok",
            payload: redactSecrets({
              tool_use_id: block.tool_use_id,
              is_error: block.is_error,
              content: block.content,
            }),
          });
        }
      }

      // Adiciona resposta do assistente ao histórico
      messages.push({ role: "assistant", content: response.content });
      stopReason = response.stop_reason;

      if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
        // Captura texto final
        finalText = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n");
        break;
      }

      if (response.stop_reason === "tool_use") {
        // Para mcp_tool_use, a Anthropic já executou e devolveu mcp_tool_result no mesmo response.
        // Para tool_use de tools client-side (HTTP API), precisamos executar e enviar tool_result
        // como user message no próximo turno.
        const clientToolUses = response.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
        );

        if (clientToolUses.length > 0) {
          const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const tu of clientToolUses) {
            const handler = httpHandlers.get(tu.name);
            if (!handler) {
              const errMsg = `Tool desconhecida: ${tu.name}`;
              await writer.write({
                kind: "error",
                payload: { message: errMsg, tool_use_id: tu.id },
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                is_error: true,
                content: errMsg,
              });
              continue;
            }
            try {
              const result = await handler.invoke(tu.input as Record<string, unknown>);
              await writer.write({
                kind: "tool_result",
                tool_name: tu.name,
                tool_status: result.ok ? "ok" : "error",
                duration_ms: result.durationMs,
                payload: redactSecrets({
                  tool_use_id: tu.id,
                  status: result.status,
                  body: result.body,
                }),
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                is_error: !result.ok,
                content: JSON.stringify({
                  status: result.status,
                  body: result.body,
                }),
              });
            } catch (err) {
              const message = (err as Error).message;
              await writer.write({
                kind: "error",
                payload: { message, tool_use_id: tu.id, tool_name: tu.name },
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                is_error: true,
                content: message,
              });
            }
          }
          messages.push({ role: "user", content: toolResults });
        }
        continue;
      }

      if (response.stop_reason === "max_tokens") {
        await writer.write({
          kind: "log",
          payload: {
            level: "warn",
            message: "Turno atingiu max_tokens — continuando se possível",
          },
        });
        continue;
      }

      // stop_reason desconhecido — para
      break;
    }

    // Finaliza com sucesso
    const finishedAt = new Date();
    const duration_ms = finishedAt.getTime() - startedAt.getTime();
    const cost_usd = computeCostUsd(snapshot.processo.model, totals);

    await service
      .from("process_runs")
      .update({
        status: "succeeded",
        finished_at: finishedAt.toISOString(),
        duration_ms,
        output: { text: finalText, stop_reason: stopReason, turns: turn },
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        cache_read_tokens: totals.cache_read_tokens,
        cache_creation_tokens: totals.cache_creation_tokens,
        cost_usd,
      })
      .eq("id", runId);

    await writer.write({
      kind: "workflow_ended",
      payload: { status: "succeeded", duration_ms, cost_usd, turns: turn },
    });

    await sendSlackNotification(service, runId);
  } catch (err) {
    const isTimeout = err instanceof TimeoutError;
    const finishedAt = new Date();
    const duration_ms = finishedAt.getTime() - startedAt.getTime();
    const cost_usd = computeCostUsd(snapshot.processo.model, totals);

    const errorPayload = {
      message: (err as Error).message ?? String(err),
      name: (err as Error).name,
      stack: process.env.NODE_ENV === "development" ? (err as Error).stack : undefined,
    };

    await service
      .from("process_runs")
      .update({
        status: isTimeout ? "timed_out" : "failed",
        finished_at: finishedAt.toISOString(),
        duration_ms,
        error: errorPayload,
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        cache_read_tokens: totals.cache_read_tokens,
        cache_creation_tokens: totals.cache_creation_tokens,
        cost_usd,
      })
      .eq("id", runId);

    await writer.write({
      kind: "error",
      payload: errorPayload,
    });
    await writer.write({
      kind: "workflow_ended",
      payload: { status: isTimeout ? "timed_out" : "failed", duration_ms },
    });

    await sendSlackNotification(service, runId);
  } finally {
    await writer.flush();
  }
}

async function sendSlackNotification(
  service: ReturnType<typeof createServiceClient>,
  runId: string,
): Promise<void> {
  try {
    const { data: updatedRun } = await service
      .from("process_runs")
      .select("*")
      .eq("id", runId)
      .single();
    if (!updatedRun) return;
    const run = updatedRun as ProcessRun;
    await notifyRunCompleted(run);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await fireChainTriggers(run, baseUrl);
  } catch (err) {
    console.error("[executeRun] post-terminal hooks failed:", err);
  }
}

class TimeoutError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TimeoutError";
  }
}

function buildInitialUserMessage(
  snapshot: ProcessoSnapshot,
  inputs: Record<string, unknown>,
): string {
  const parts: string[] = [
    `Execute o processo "${snapshot.processo.name}".`,
  ];
  if (Object.keys(inputs).length > 0) {
    parts.push(`Inputs fornecidos:\n\`\`\`json\n${JSON.stringify(inputs, null, 2)}\n\`\`\``);
  }
  parts.push(
    `Use as ferramentas disponíveis para completar a análise. Quando terminar, escreva um relatório final claro e estruturado.`,
  );
  return parts.join("\n\n");
}
