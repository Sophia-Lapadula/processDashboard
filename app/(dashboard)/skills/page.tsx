import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/util/format";

export default async function SkillsListPage() {
  const supabase = await createClient();
  const { data: skills } = await supabase
    .from("skills")
    .select("id, slug, name, description, updated_at, current_version_id, skill_versions!skills_current_version_fk(version_number)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lógicas reutilizáveis. Cada skill tem histórico de versões.
          </p>
        </div>
        <Link href="/skills/new" className="btn-primary">
          Nova skill
        </Link>
      </div>

      {!skills || skills.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sm text-muted-foreground">
            Nenhuma skill ainda. Comece criando o &quot;BAT cadastral&quot;.
          </p>
        </div>
      ) : (
        <div className="card p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nome</th>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-left px-4 py-2 font-medium">Versão atual</th>
                <th className="text-left px-4 py-2 font-medium">Editada</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => {
                const v = (s as unknown as { skill_versions: { version_number: number } | null }).skill_versions;
                return (
                  <tr key={s.id} className="table-row">
                    <td className="px-4 py-2">
                      <Link href={`/skills/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                      {s.slug}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {v ? `v${v.version_number}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatRelative(s.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
