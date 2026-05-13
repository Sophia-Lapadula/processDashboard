import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewProcessoForm from "./NewProcessoForm";

export default async function NewProcessoPage() {
  const supabase = await createClient();

  const [{ data: skills }, { data: clientes }] = await Promise.all([
    supabase
      .from("skills")
      .select("id, name, slug")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("clientes")
      .select("id, name")
      .is("archived_at", null)
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/processos"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Processos
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Novo processo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Etapa 1: vincule a skill base. Você configurará conectores, prompt e trigger
          na próxima tela.
        </p>
      </div>
      <NewProcessoForm skills={skills ?? []} clientes={clientes ?? []} />
    </div>
  );
}
