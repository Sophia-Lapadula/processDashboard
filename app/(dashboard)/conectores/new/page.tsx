import Link from "next/link";
import NewConectorForm from "./NewConectorForm";

export default function NewConectorPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/conectores" className="text-xs text-muted-foreground hover:text-foreground">
          ← Conectores
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Novo conector</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre um servidor MCP. (HTTP API genérico vem na Fase 3.)
        </p>
      </div>
      <NewConectorForm />
    </div>
  );
}
