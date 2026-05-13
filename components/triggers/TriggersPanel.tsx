"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWebhookTrigger,
  createCronTrigger,
  createChainTrigger,
  toggleTrigger,
  deleteTrigger,
} from "@/app/actions/triggers";
import type { TriggerKind } from "@/lib/db/types";

interface TriggerRow {
  id: string;
  kind: TriggerKind;
  enabled: boolean;
  config: Record<string, unknown>;
}

export default function TriggersPanel({
  processoId,
  triggers,
  appUrl,
  otherProcessos,
}: {
  processoId: string;
  triggers: TriggerRow[];
  appUrl: string;
  otherProcessos: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<null | "webhook" | "cron" | "chain">(null);

  function handleToggle(triggerId: string, enabled: boolean) {
    startTransition(async () => {
      const r = await toggleTrigger(triggerId, enabled);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function handleDelete(triggerId: string) {
    if (!confirm("Remover esse trigger?")) return;
    startTransition(async () => {
      const r = await deleteTrigger(triggerId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  async function handleNewWebhook(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("processoId", processoId);
    startTransition(async () => {
      const r = await createWebhookTrigger(fd);
      if (!r.ok) setError(r.error);
      else {
        setShowNew(null);
        router.refresh();
      }
    });
  }

  async function handleNewCron(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("processoId", processoId);
    startTransition(async () => {
      const r = await createCronTrigger(fd);
      if (!r.ok) setError(r.error);
      else {
        setShowNew(null);
        router.refresh();
      }
    });
  }

  async function handleNewChain(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("processoId", processoId);
    startTransition(async () => {
      const r = await createChainTrigger(fd);
      if (!r.ok) setError(r.error);
      else {
        setShowNew(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Triggers</h3>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setShowNew("webhook")}
          >
            + Webhook
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setShowNew("cron")}
          >
            + Cron
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setShowNew("chain")}
            disabled={otherProcessos.length === 0}
            title={otherProcessos.length === 0 ? "Crie outro processo primeiro" : ""}
          >
            + Encadeamento
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <ul className="space-y-2">
        {triggers.map((t) => (
          <TriggerItem
            key={t.id}
            trigger={t}
            appUrl={appUrl}
            otherProcessos={otherProcessos}
            onToggle={handleToggle}
            onDelete={handleDelete}
            pending={pending}
          />
        ))}
        {triggers.length === 0 && (
          <li className="text-xs text-muted-foreground">Nenhum trigger configurado.</li>
        )}
      </ul>

      {showNew === "webhook" && (
        <form
          onSubmit={handleNewWebhook}
          className="border-t pt-3 space-y-2 text-sm"
        >
          <div className="font-medium text-xs">Novo webhook</div>
          <div>
            <label className="label">
              <input
                type="checkbox"
                name="require_hmac"
                value="true"
                className="mr-2"
                defaultChecked
              />
              Exigir HMAC (X-Axenya-Signature)
            </label>
          </div>
          <div>
            <label className="label">
              Payload mapping (JSON, opcional)
            </label>
            <textarea
              name="payload_mapping_json"
              className="textarea min-h-16"
              placeholder='{"mes_referencia":"$.month","cliente":"$.client_id"}'
            />
            <p className="hint">JSONPath simples por campo. Vazio = body inteiro vira inputs.</p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setShowNew(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary text-xs" disabled={pending}>
              Criar
            </button>
          </div>
        </form>
      )}

      {showNew === "chain" && (
        <form onSubmit={handleNewChain} className="border-t pt-3 space-y-2 text-sm">
          <div className="font-medium text-xs">Encadeamento</div>
          <p className="text-xs text-muted-foreground">
            Quando o processo escolhido terminar com a condição definida, esse processo será disparado automaticamente.
          </p>
          <div>
            <label className="label">Processo pai</label>
            <select name="parent_processo_id" className="input" required>
              <option value="">Selecione...</option>
              {otherProcessos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Disparar quando</label>
            <select name="on" className="input" defaultValue="success">
              <option value="success">Pai terminou com sucesso</option>
              <option value="failure">Pai falhou</option>
              <option value="any">Qualquer status terminal</option>
            </select>
          </div>
          <div>
            <label className="label">Input mapping (JSON, opcional)</label>
            <textarea
              name="input_mapping_json"
              className="textarea min-h-16"
              placeholder='{"resumo_pai":"$.text"}'
            />
            <p className="hint">
              JSONPath aplicado ao <code>output</code> do parent. Sem mapping, o texto vem em
              <code> parent_output_text</code>.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setShowNew(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary text-xs" disabled={pending}>
              Criar
            </button>
          </div>
        </form>
      )}

      {showNew === "cron" && (
        <form onSubmit={handleNewCron} className="border-t pt-3 space-y-2 text-sm">
          <div className="font-medium text-xs">Novo cron</div>
          <div>
            <label className="label">Expressão cron</label>
            <input
              name="cron_expression"
              className="input font-mono text-xs"
              placeholder="0 8 * * 1"
              required
            />
            <p className="hint">
              Toda segunda 8h: <code>0 8 * * 1</code> · Diariamente 6h:{" "}
              <code>0 6 * * *</code>
            </p>
          </div>
          <div>
            <label className="label">Timezone</label>
            <input
              name="timezone"
              className="input"
              defaultValue="America/Sao_Paulo"
              required
            />
          </div>
          <div>
            <label className="label">Inputs fixos (JSON, opcional)</label>
            <textarea
              name="static_inputs_json"
              className="textarea min-h-16"
              placeholder='{"cliente":"takoda"}'
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setShowNew(null)}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary text-xs" disabled={pending}>
              Criar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TriggerItem({
  trigger,
  appUrl,
  otherProcessos,
  onToggle,
  onDelete,
  pending,
}: {
  trigger: TriggerRow;
  appUrl: string;
  otherProcessos: { id: string; name: string }[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);

  if (trigger.kind === "manual") {
    return (
      <li className="border rounded-md px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium">Manual</span>
          <span className="text-muted-foreground">sempre disponível</span>
        </div>
      </li>
    );
  }

  if (trigger.kind === "webhook") {
    const token = trigger.config.token as string;
    const hmacSecret = trigger.config.hmac_secret as string | undefined;
    const url = `${appUrl}/api/triggers/webhook/${token}`;
    return (
      <li className="border rounded-md px-3 py-2 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">Webhook</span>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={trigger.enabled}
                onChange={(e) => onToggle(trigger.id, e.target.checked)}
                disabled={pending}
              />
              <span className="text-muted-foreground">
                {trigger.enabled ? "ativo" : "desativado"}
              </span>
            </label>
            <button
              type="button"
              className="text-danger hover:underline"
              onClick={() => onDelete(trigger.id)}
              disabled={pending}
            >
              remover
            </button>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">POST</div>
          <code className="block bg-muted rounded px-2 py-1 font-mono break-all">
            {url}
          </code>
        </div>
        {hmacSecret && (
          <div>
            <div className="text-muted-foreground mb-1 flex items-center gap-2">
              HMAC secret (cabeçalho <code>X-Axenya-Signature</code>)
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="text-primary hover:underline"
              >
                {showSecret ? "ocultar" : "mostrar"}
              </button>
            </div>
            <code className="block bg-muted rounded px-2 py-1 font-mono break-all">
              {showSecret ? hmacSecret : "•".repeat(40)}
            </code>
          </div>
        )}
      </li>
    );
  }

  if (trigger.kind === "chain") {
    const parentId = trigger.config.parent_processo_id as string;
    const on = trigger.config.on as string;
    const parentName =
      otherProcessos.find((p) => p.id === parentId)?.name ?? `processo ${parentId.slice(0, 8)}`;
    const onLabel: Record<string, string> = {
      success: "ao terminar com sucesso",
      failure: "ao falhar",
      any: "em qualquer status terminal",
    };
    return (
      <li className="border rounded-md px-3 py-2 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            Encadeamento — após <strong>{parentName}</strong>{" "}
            <span className="text-muted-foreground">{onLabel[on] ?? on}</span>
          </span>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={trigger.enabled}
                onChange={(e) => onToggle(trigger.id, e.target.checked)}
                disabled={pending}
              />
              <span className="text-muted-foreground">
                {trigger.enabled ? "ativo" : "desativado"}
              </span>
            </label>
            <button
              type="button"
              className="text-danger hover:underline"
              onClick={() => onDelete(trigger.id)}
              disabled={pending}
            >
              remover
            </button>
          </div>
        </div>
      </li>
    );
  }

  if (trigger.kind === "cron") {
    const cron = trigger.config.cron_expression as string;
    const tz = trigger.config.timezone as string;
    return (
      <li className="border rounded-md px-3 py-2 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            Cron <code className="font-mono ml-1">{cron}</code>
            <span className="text-muted-foreground ml-2">{tz}</span>
          </span>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={trigger.enabled}
                onChange={(e) => onToggle(trigger.id, e.target.checked)}
                disabled={pending}
              />
              <span className="text-muted-foreground">
                {trigger.enabled ? "ativo" : "desativado"}
              </span>
            </label>
            <button
              type="button"
              className="text-danger hover:underline"
              onClick={() => onDelete(trigger.id)}
              disabled={pending}
            >
              remover
            </button>
          </div>
        </div>
      </li>
    );
  }

  return null;
}
