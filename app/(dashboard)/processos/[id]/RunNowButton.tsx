"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runProcessoNow } from "@/app/actions/runs";

export default function RunNowButton({
  processoId,
  status,
}: {
  processoId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (status === "paused") {
      if (!confirm("Esse processo está pausado. Rodar mesmo assim?")) return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runProcessoNow(processoId, null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/runs/${result.runId}`);
    });
  }

  return (
    <div className="text-right">
      <button
        onClick={handleClick}
        disabled={pending}
        className="btn-primary"
      >
        {pending ? "Disparando..." : "▶ Rodar agora"}
      </button>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
