"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setProcessoSlackDestination } from "@/app/actions/slack";

export default function SlackDestinationPicker({
  processoId,
  currentId,
  destinations,
}: {
  processoId: string;
  currentId: string | null;
  destinations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    setError(null);
    startTransition(async () => {
      const r = await setProcessoSlackDestination(processoId, value);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="card space-y-2">
      <h3 className="font-medium text-sm">Notificação Slack</h3>
      {destinations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum destino cadastrado.{" "}
          <Link
            href="/settings/slack"
            className="text-primary hover:underline"
          >
            Cadastrar agora
          </Link>
        </p>
      ) : (
        <select
          className="input"
          value={currentId ?? ""}
          onChange={handleChange}
          disabled={pending}
        >
          <option value="">— sem notificação —</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
