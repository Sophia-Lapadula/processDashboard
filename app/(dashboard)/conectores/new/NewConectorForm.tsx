"use client";

import { useState, useTransition } from "react";
import { createMcpConector, createHttpApiConector } from "@/app/actions/conectores";

const HTTP_ENDPOINTS_TEMPLATE = `[
  {
    "name": "list_items",
    "method": "GET",
    "path": "/items",
    "description": "Lista todos os itens disponíveis. Use quando precisar de uma visão geral do catálogo.",
    "input_schema": {
      "type": "object",
      "properties": {
        "limit": { "type": "number", "description": "Máximo de itens" }
      }
    }
  }
]`;

export default function NewConectorForm() {
  const [tab, setTab] = useState<"mcp" | "http_api">("mcp");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const action = tab === "mcp" ? createMcpConector : createHttpApiConector;
      const result = await action(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex border-b text-sm">
        <button
          type="button"
          onClick={() => setTab("mcp")}
          className={`px-4 py-2 -mb-px border-b-2 ${
            tab === "mcp"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          MCP server
        </button>
        <button
          type="button"
          onClick={() => setTab("http_api")}
          className={`px-4 py-2 -mb-px border-b-2 ${
            tab === "http_api"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          HTTP API
        </button>
      </div>

      {tab === "mcp" ? (
        <McpForm onSubmit={handleSubmit} pending={pending} />
      ) : (
        <HttpApiForm onSubmit={handleSubmit} pending={pending} />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function McpForm({
  onSubmit,
  pending,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input id="name" name="name" className="input" placeholder="MCP BigQuery Takoda" required />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Descrição (opcional)
          </label>
          <input id="description" name="description" className="input" />
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
            placeholder="https://mcp.exemplo.com/v1"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="transport">
            Transporte
          </label>
          <select id="transport" name="transport" className="input" defaultValue="http">
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="authorization_token">
            Bearer token (opcional)
          </label>
          <input
            id="authorization_token"
            name="authorization_token"
            type="password"
            className="input font-mono text-xs"
            placeholder="Cole o token aqui (criptografado no banco)"
          />
        </div>
        <div>
          <label className="label" htmlFor="tool_allowlist">
            Tool allowlist (opcional)
          </label>
          <input
            id="tool_allowlist"
            name="tool_allowlist"
            className="input"
            placeholder="bigquery_query, bigquery_describe"
          />
          <p className="hint">Vazio = todas as tools do MCP ficam disponíveis.</p>
        </div>
        <div>
          <label className="label" htmlFor="extra_headers_json">
            Headers extras (JSON, opcional)
          </label>
          <textarea
            id="extra_headers_json"
            name="extra_headers_json"
            className="textarea min-h-20"
            placeholder='{"X-Tenant-Id": "takoda"}'
          />
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Criando..." : "Criar conector"}
      </button>
    </form>
  );
}

function HttpApiForm({
  onSubmit,
  pending,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
}) {
  const [authType, setAuthType] = useState("bearer");
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input id="name" name="name" className="input" placeholder="API Operadora X" required />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Descrição (opcional)
          </label>
          <input id="description" name="description" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="base_url">
            Base URL
          </label>
          <input
            id="base_url"
            name="base_url"
            type="url"
            className="input font-mono text-xs"
            placeholder="https://api.exemplo.com/v2"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="auth_type">
            Tipo de auth
          </label>
          <select
            id="auth_type"
            name="auth_type"
            className="input"
            value={authType}
            onChange={(e) => setAuthType(e.target.value)}
          >
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic auth</option>
            <option value="api_key_header">API key (header)</option>
            <option value="api_key_query">API key (query string)</option>
            <option value="none">Sem auth</option>
          </select>
        </div>

        {authType === "bearer" && (
          <div>
            <label className="label" htmlFor="bearer_token">
              Bearer token
            </label>
            <input
              id="bearer_token"
              name="bearer_token"
              type="password"
              className="input font-mono text-xs"
            />
          </div>
        )}

        {authType === "basic" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="basic_username">Username</label>
              <input id="basic_username" name="basic_username" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="basic_password">Password</label>
              <input id="basic_password" name="basic_password" type="password" className="input" />
            </div>
          </div>
        )}

        {(authType === "api_key_header" || authType === "api_key_query") && (
          <>
            <div>
              <label className="label" htmlFor="api_key">API key</label>
              <input id="api_key" name="api_key" type="password" className="input font-mono text-xs" />
            </div>
            {authType === "api_key_header" && (
              <div>
                <label className="label" htmlFor="auth_header_name">Nome do header</label>
                <input
                  id="auth_header_name"
                  name="auth_header_name"
                  className="input font-mono text-xs"
                  placeholder="X-Api-Key"
                  required
                />
              </div>
            )}
            {authType === "api_key_query" && (
              <div>
                <label className="label" htmlFor="auth_query_param">Nome do query param</label>
                <input
                  id="auth_query_param"
                  name="auth_query_param"
                  className="input font-mono text-xs"
                  placeholder="api_key"
                  required
                />
              </div>
            )}
          </>
        )}

        <div>
          <label className="label" htmlFor="endpoints_json">
            Endpoints (JSON)
          </label>
          <textarea
            id="endpoints_json"
            name="endpoints_json"
            className="textarea min-h-64"
            defaultValue={HTTP_ENDPOINTS_TEMPLATE}
            required
          />
          <p className="hint">
            Cada endpoint vira uma tool disponível ao agente. <code>name</code> precisa ser
            identificador (letras/dígitos/underscore). <code>input_schema</code> é JSONSchema.
          </p>
        </div>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Criando..." : "Criar conector"}
      </button>
    </form>
  );
}
