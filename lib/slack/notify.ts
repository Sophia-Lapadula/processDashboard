import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret, bytesToBuffer } from "@/lib/secrets/crypto";
import {
  formatDuration,
  formatCostUsd,
  formatTokens,
} from "@/lib/util/format";
import type { ProcessRun, ProcessoSnapshot } from "@/lib/db/types";

interface SlackSecret {
  webhook_url: string;
}

const STATUS_EMOJI: Record<string, string> = {
  succeeded: ":white_check_mark:",
  failed: ":x:",
  cancelled: ":no_entry_sign:",
  timed_out: ":hourglass:",
};

/**
 * Notifica o destino Slack configurado no processo (se houver) sobre o término de um run.
 * Falhas não interrompem a execução — apenas logam.
 */
export async function notifyRunCompleted(run: ProcessRun): Promise<void> {
  const snapshot = run.processo_snapshot as unknown as ProcessoSnapshot;
  const destinationId = snapshot?.processo?.slack_destination_id;
  if (!destinationId) return;

  const service = createServiceClient();
  const { data: dest } = await service
    .from("slack_destinations")
    .select("id, name, kind, secrets_id, enabled")
    .eq("id", destinationId)
    .single();
  if (!dest || !dest.enabled || dest.kind !== "incoming_webhook" || !dest.secrets_id) {
    return;
  }

  const { data: secretRow } = await service
    .from("conector_secrets")
    .select("encrypted_payload, key_version")
    .eq("id", dest.secrets_id)
    .single();
  if (!secretRow) return;

  let webhookUrl: string;
  try {
    const buf = bytesToBuffer(secretRow.encrypted_payload);
    const payload = decryptSecret<SlackSecret>(buf, secretRow.key_version);
    webhookUrl = payload.webhook_url;
  } catch (err) {
    console.error("[slack notify] decrypt failed:", (err as Error).message);
    return;
  }

  const emoji = STATUS_EMOJI[run.status] ?? ":grey_question:";
  const processoName = snapshot.processo.name;
  const clienteName = snapshot.cliente?.name;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const runUrl = appUrl ? `${appUrl}/runs/${run.id}` : null;

  const fields: Array<{ title: string; value: string; short: boolean }> = [
    { title: "Status", value: run.status, short: true },
    { title: "Duração", value: formatDuration(run.duration_ms), short: true },
    { title: "Custo", value: formatCostUsd(run.cost_usd), short: true },
    {
      title: "Tokens",
      value: `in ${formatTokens(run.input_tokens)} · out ${formatTokens(run.output_tokens)}`,
      short: true,
    },
  ];

  let preview: string | undefined;
  const output = run.output as { text?: string } | null;
  if (output?.text) {
    preview = output.text.length > 800 ? output.text.slice(0, 800) + "…" : output.text;
  }
  const errPayload = run.error as { message?: string; name?: string } | null;
  if (errPayload?.message) {
    preview = `*${errPayload.name ?? "Error"}:* ${errPayload.message}`;
  }

  const titleParts = [`${emoji} ${processoName}`];
  if (clienteName) titleParts.push(`(${clienteName})`);
  const title = titleParts.join(" ");

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*` },
    },
    {
      type: "section",
      fields: fields.map((f) => ({
        type: "mrkdwn",
        text: `*${f.title}:* ${f.value}`,
      })),
    },
  ];

  if (preview) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "```" + preview.replace(/```/g, "''") + "```" },
    });
  }

  if (runUrl) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${runUrl}|Ver execução>` }],
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks, text: title }),
    });
    if (!response.ok) {
      console.error(
        `[slack notify] HTTP ${response.status}: ${await response.text().catch(() => "?")}`,
      );
    }
  } catch (err) {
    console.error("[slack notify] fetch failed:", err);
  }
}
