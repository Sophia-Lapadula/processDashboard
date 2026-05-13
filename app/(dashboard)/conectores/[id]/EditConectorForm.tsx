"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMcpConector } from "@/app/actions/conectores";

interface Initial {
  name: string;
  description: string;
  url: string;
  transport: "http" | "sse";
  tool_allowlist: string;
  extra_headers_json: string;
  hasSecret: boolean;
}

export default function EditConectorForm({
  conectorId,
  initial,
}: {
  conectorId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set("conectorId", conectorId);
    startTransition(async () => {
      const result = await updateMcpConector(fd);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={initial.name}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Descrição
          </label>
          <input
            id="description"
            name="description"
            className="input"
            defaultValue={initial.description}
          />
        </div>
        <div>
          <label className="label" htmlFor="url">
            URL do MCP server
          </label>
          <input
            id="url"
            name="url"
            type="url"
            className="input font-mono text-xs"
            defaultValue={initial.url}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="transport">
            Transporte
          </label>
          <select
            id="transport"
            name="transport"
            className="input"
            defaultValue={initial.transport}
          >
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="authorization_token">
            Bearer token{" "}
            {initial.hasSecret && (
              <span className="text-xs text-success ml-1">(configurado)</span>
            )}
          </label>
          <input
            id="authorization_token"
            name="authorization_token"
            type="password"
            className="input font-mono text-xs"
            placeholder={
              initial.hasSecret
                ? "Deixe vazio pra manter o atual, ou cole um novo pra rotacionar"
                : "Cole o token aqui"
            }
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label" htmlFor="tool_allowlist">
            Tool allowlist
          </label>
          <input
            id="tool_allowlist"
            name="tool_allowlist"
            className="input"
            defaultValue={initial.tool_allowlist}
            placeholder="bigquery_query, bigquery_describe"
          />
        </div>
        <div>
          <label className="label" htmlFor="extra_headers_json">
            Headers extras (JSON)
          </label>
          <textarea
            id="extra_headers_json"
            name="extra_headers_json"
            className="textarea min-h-20"
            defaultValue={initial.extra_headers_json}
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Salvo.</p>}

      <div className="flex gap-2 justify-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
