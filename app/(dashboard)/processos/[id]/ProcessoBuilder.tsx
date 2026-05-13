"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateProcesso } from "@/app/actions/processos";
import { AVAILABLE_MODELS } from "@/lib/costs/model-rates";

interface Initial {
  name: string;
  description: string;
  skillId: string;
  skillName: string;
  clienteId: string | null;
  custom_prompt: string;
  model: string;
  max_turns: number;
  max_duration_seconds: number;
  inputs_schema_json: string;
  default_inputs_json: string;
  status: "draft" | "active" | "paused";
  selected_conector_ids: string[];
}

export default function ProcessoBuilder({
  processoId,
  skills,
  conectores,
  clientes,
  initial,
}: {
  processoId: string;
  skills: { id: string; name: string }[];
  conectores: { id: string; name: string; type: string }[];
  clientes: { id: string; name: string }[];
  initial: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [clienteId, setClienteId] = useState(initial.clienteId ?? "");
  const [customPrompt, setCustomPrompt] = useState(initial.custom_prompt);
  const [model, setModel] = useState(initial.model);
  const [maxTurns, setMaxTurns] = useState(initial.max_turns);
  const [maxDuration, setMaxDuration] = useState(initial.max_duration_seconds);
  const [inputsSchema, setInputsSchema] = useState(initial.inputs_schema_json);
  const [defaultInputs, setDefaultInputs] = useState(initial.default_inputs_json);
  const [status, setStatus] = useState<Initial["status"]>(initial.status);
  const [selectedConectorIds, setSelectedConectorIds] = useState<string[]>(
    initial.selected_conector_ids,
  );

  function toggleConector(id: string) {
    setSelectedConectorIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProcesso({
        processoId,
        name,
        description,
        cliente_id: clienteId || null,
        custom_prompt: customPrompt,
        model,
        max_turns: maxTurns,
        max_duration_seconds: maxDuration,
        inputs_schema_json: inputsSchema,
        default_inputs_json: defaultInputs,
        status,
        selected_conector_ids: selectedConectorIds,
      });
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div className="card space-y-4">
          <h3 className="font-medium text-sm">Identidade</h3>
          <div>
            <label className="label">Nome</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Cliente</label>
            <select
              className="input"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">— sem cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Skill base</h3>
          <p className="text-xs text-muted-foreground">
            Skill atual: <Link href={`/skills/${initial.skillId}`} className="hover:underline font-medium">{initial.skillName}</Link>
          </p>
          <p className="text-xs text-muted-foreground">
            O processo sempre usa a versão HEAD da skill no momento da execução.
            (Pinning de versão vem na Fase 4.)
          </p>
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Prompt customizado</h3>
          <textarea
            className="textarea min-h-32"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Instrução específica deste processo. Será concatenada ao conteúdo da skill durante a execução. Ex: 'Execute o BAT cadastral para o cliente Takoda, considerando o dataset takoda_prod do BigQuery.'"
          />
          <p className="hint">
            O sistema combina: <code className="font-mono">skill content</code> +{" "}
            <code className="font-mono">custom_prompt</code> +{" "}
            <code className="font-mono">inputs do run</code>.
          </p>
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Conectores</h3>
          {conectores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum conector disponível.{" "}
              <Link href="/conectores/new" className="text-primary hover:underline">
                Criar agora
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-1">
              {conectores.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`con-${c.id}`}
                    checked={selectedConectorIds.includes(c.id)}
                    onChange={() => toggleConector(c.id)}
                  />
                  <label htmlFor={`con-${c.id}`} className="flex-1 cursor-pointer">
                    {c.name}
                    <span className="ml-2 text-xs text-muted-foreground uppercase font-mono">
                      {c.type}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Inputs estruturados (opcional)</h3>
          <div>
            <label className="label">Schema (JSONSchema)</label>
            <textarea
              className="textarea min-h-24"
              value={inputsSchema}
              onChange={(e) => setInputsSchema(e.target.value)}
              placeholder='{"type":"object","properties":{"mes_referencia":{"type":"string"}}}'
            />
          </div>
          <div>
            <label className="label">Inputs default (JSON)</label>
            <textarea
              className="textarea min-h-20"
              value={defaultInputs}
              onChange={(e) => setDefaultInputs(e.target.value)}
              placeholder='{"mes_referencia":"2026-05"}'
            />
          </div>
        </div>
      </div>

      <div className="col-span-1 space-y-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Execução</h3>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as Initial["status"])}
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </select>
          </div>
          <div>
            <label className="label">Modelo</label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Max turns</label>
            <input
              type="number"
              className="input"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              min={1}
              max={100}
            />
          </div>
          <div>
            <label className="label">Timeout (segundos)</label>
            <input
              type="number"
              className="input"
              value={maxDuration}
              onChange={(e) => setMaxDuration(Number(e.target.value))}
              min={30}
              max={3600}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && <p className="text-sm text-success">Salvo.</p>}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Salvando..." : "Salvar processo"}
        </button>
      </div>
    </form>
  );
}
