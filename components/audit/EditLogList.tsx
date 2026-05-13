import { formatRelative } from "@/lib/util/format";

interface Log {
  id: string;
  action: string;
  ts: string;
  metadata: unknown;
}

const actionLabels: Record<string, string> = {
  created: "Criada",
  updated: "Editada",
  archived: "Arquivada",
  restored: "Restaurada",
  rolled_back: "Versão restaurada",
  version_published: "Nova versão",
};

export default function EditLogList({ logs }: { logs: Log[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem registros.</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {logs.map((l) => {
        const meta = l.metadata as Record<string, unknown> | null;
        const vNum = meta?.version_number;
        const summary = meta?.change_summary as string | undefined;
        return (
          <li key={l.id} className="rounded-md px-2 py-1.5 border-transparent">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {actionLabels[l.action] ?? l.action}
                {vNum != null && <span className="font-mono ml-1">v{String(vNum)}</span>}
              </span>
              <span className="text-muted-foreground">{formatRelative(l.ts)}</span>
            </div>
            {summary && <div className="text-muted-foreground mt-0.5">{summary}</div>}
          </li>
        );
      })}
    </ul>
  );
}
