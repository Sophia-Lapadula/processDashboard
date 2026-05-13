import Link from "next/link";
import NewSkillForm from "./NewSkillForm";

export default function NewSkillPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/skills"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Skills
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Nova skill</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Skills são lógicas reutilizáveis usadas pelos processos. Use markdown.
        </p>
      </div>
      <NewSkillForm />
    </div>
  );
}
