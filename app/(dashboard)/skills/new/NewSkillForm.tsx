"use client";

import { useState, useTransition } from "react";
import { createSkill } from "@/app/actions/skills";

const TEMPLATE = `# BAT cadastral

Você é responsável por executar uma análise BAT cadastral para o cliente informado.

## Objetivo
[descrever o objetivo da análise]

## Passos
1. Use o conector de dados (BigQuery via MCP) para consultar...
2. Compare com...
3. Produza um relatório com...

## Output esperado
- Resumo executivo
- Tabela de descobertas
- Recomendações
`;

export default function NewSkillForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(TEMPLATE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("content", content);
    startTransition(async () => {
      const result = await createSkill(fd);
      if (!result.ok) setError(result.error);
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
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="BAT cadastral"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Descrição (opcional)
          </label>
          <input
            id="description"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Análise cadastral comparando base do cliente com..."
          />
        </div>
        <div>
          <label className="label" htmlFor="content">
            Conteúdo da skill
          </label>
          <textarea
            id="content"
            className="textarea min-h-96"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <p className="hint">
            Instrução em linguagem natural. Será concatenada ao prompt do processo durante a execução.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Criando..." : "Criar skill"}
        </button>
      </div>
    </form>
  );
}
