"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSkillVersion } from "@/app/actions/skills";

export default function SkillEditor({
  skillId,
  initialContent,
  currentVersionNumber,
}: {
  skillId: string;
  initialContent: string;
  currentVersionNumber: number;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [changeSummary, setChangeSummary] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const dirty = content !== initialContent;

  function handleSave() {
    setError(null);
    const fd = new FormData();
    fd.set("skillId", skillId);
    fd.set("content", content);
    if (changeSummary) fd.set("changeSummary", changeSummary);
    startTransition(async () => {
      const result = await saveSkillVersion(fd);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSavedAt(new Date());
        setChangeSummary("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Editando — próxima versão será <strong className="font-mono">v{currentVersionNumber + 1}</strong>
        </div>
        {dirty ? (
          <span className="badge-warning">Modificado</span>
        ) : savedAt ? (
          <span className="badge-success">Salvo</span>
        ) : (
          <span className="badge-muted">Sem mudanças</span>
        )}
      </div>
      <textarea
        className="textarea min-h-[400px]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div>
        <label className="label" htmlFor="changeSummary">
          Resumo da mudança (opcional)
        </label>
        <input
          id="changeSummary"
          className="input"
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="ex: ajustei instrução de comparação"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setContent(initialContent)}
          disabled={!dirty || pending}
        >
          Reverter
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={!dirty || pending}
        >
          {pending ? "Salvando..." : "Salvar nova versão"}
        </button>
      </div>
    </div>
  );
}
