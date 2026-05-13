"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCliente } from "@/app/actions/clientes";
import { formatRelative } from "@/lib/util/format";

interface Cliente {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export default function ClientesView({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    startTransition(async () => {
      const result = await createCliente(fd);
      if (!result.ok) setError(result.error);
      else {
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="card flex gap-2 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="name">
            Nome do cliente
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Takoda"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "..." : "Adicionar"}
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {clientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nome</th>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-left px-4 py-2 font-medium">Criado</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="table-row">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {c.slug}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatRelative(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
