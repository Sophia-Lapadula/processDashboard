"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSlackDestination,
  deleteSlackDestination,
} from "@/app/actions/slack";
import { formatRelative } from "@/lib/util/format";

interface Destination {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  created_at: string;
}

export default function SlackDestinationsView({
  destinations,
}: {
  destinations: Destination[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createSlackDestination(fd);
      if (!r.ok) setError(r.error);
      else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Remover esse destino?")) return;
    startTransition(async () => {
      const r = await deleteSlackDestination(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Cancelar" : "+ Novo destino"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-3">
          <div>
            <label className="label" htmlFor="name">
              Nome
            </label>
            <input
              id="name"
              name="name"
              className="input"
              placeholder="#ops-axenya"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="webhook_url">
              Incoming Webhook URL
            </label>
            <input
              id="webhook_url"
              name="webhook_url"
              type="url"
              className="input font-mono text-xs"
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              required
            />
            <p className="hint">Será criptografada no banco.</p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {destinations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum destino configurado.</p>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nome</th>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2 font-medium">Criado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="px-4 py-2 font-medium">{d.name}</td>
                  <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                    {d.kind}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatRelative(d.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      disabled={pending}
                      className="text-xs text-danger hover:underline"
                    >
                      remover
                    </button>
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
