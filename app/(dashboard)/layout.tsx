import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavLink from "@/components/layout/NavLink";
import SignOutButton from "@/components/layout/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r bg-muted/40 flex flex-col">
        <div className="px-4 py-5 border-b">
          <Link href="/" className="block">
            <div className="text-sm font-semibold">Processos Axenya</div>
            <div className="text-xs text-muted-foreground">Plataforma interna</div>
          </Link>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 text-sm">
          <NavLink href="/" exact>
            Visão geral
          </NavLink>
          <NavLink href="/processos">Processos</NavLink>
          <NavLink href="/skills">Skills</NavLink>
          <NavLink href="/conectores">Conectores</NavLink>
          <NavLink href="/runs">Execuções</NavLink>
          <div className="pt-3 mt-3 border-t" />
          <NavLink href="/clientes">Clientes</NavLink>
          <NavLink href="/settings/slack">Slack</NavLink>
        </nav>
        <div className="px-3 py-3 border-t text-xs text-muted-foreground">
          <div className="truncate" title={user.email ?? ""}>
            {user.email}
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
