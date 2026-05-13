"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { rollbackSkill } from "@/app/actions/skills";
import { formatRelative } from "@/lib/util/format";

interface Version {
  id: string;
  version_number: number;
  change_summary: string | null;
  created_at: string;
}

export default function VersionHistory({
  skillId,
  versions,
  currentVersionId,
}: {
  skillId: string;
  versions: Version[];
  currentVersionId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (versions.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem versões.</p>;
  }

  function handleRollback(versionId: string) {
    if (!confirm("Restaurar essa versão como atual?")) return;
    startTransition(async () => {
      await rollbackSkill(skillId, versionId);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-1 text-xs">
      {versions.map((v) => {
        const isCurrent = v.id === currentVersionId;
        return (
          <li
            key={v.id}
            className={`rounded-md px-2 py-1.5 border ${
              isCurrent ? "border-primary bg-primary/5" : "border-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">v{v.version_number}</span>
              <span className="text-muted-foreground">{formatRelative(v.created_at)}</span>
            </div>
            {v.change_summary && (
              <div className="text-muted-foreground mt-0.5">{v.change_summary}</div>
            )}
            {!isCurrent && (
              <button
                onClick={() => handleRollback(v.id)}
                disabled={pending}
                className="text-primary hover:underline mt-1 disabled:opacity-50"
              >
                Restaurar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
