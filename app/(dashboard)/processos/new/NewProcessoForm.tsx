"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createProcesso } from "@/app/actions/processos";

export default function NewProcessoForm({
  skills,
  clientes,
}: {
  skills: { id: string; name: string }[];
  clientes: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createProcesso(fd);
      if (!result.ok) setError(result.error);
    });
  }

  if (skills.length === 0) {
    return (
      <div className="card text-sm space-y-2">
        <p>Você precisa criar uma skill primeiro.</p>
        <Link href="/skills/new" className="btn-primary inline-block">
          Criar skill
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Nome do processo
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="BAT cadastral Takoda"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Descrição (opcional)
          </label>
          <input
            id="description"
            name="description"
            className="input"
            placeholder="Análise cadastral mensal Takoda"
          />
        </div>
        <div>
          <label className="label" htmlFor="skill_id">
            Skill
          </label>
          <select id="skill_id" name="skill_id" className="input" required>
            <option value="">Selecione uma skill...</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cliente_id">
            Cliente (opcional)
          </label>
          <select id="cliente_id" name="cliente_id" className="input" defaultValue="">
            <option value="">— sem cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Criando..." : "Criar e continuar"}
        </button>
      </div>
    </form>
  );
}
