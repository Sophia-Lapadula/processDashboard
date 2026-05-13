import { createClient } from "@/lib/supabase/server";
import ClientesView from "./ClientesView";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, slug, name, created_at")
    .is("archived_at", null)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tag canônica usada nos processos (evita &quot;Takoda&quot; vs &quot;takoda&quot;).
        </p>
      </div>
      <ClientesView clientes={clientes ?? []} />
    </div>
  );
}
