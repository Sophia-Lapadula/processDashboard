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
      <aside className="w-60 border-r border-border bg-muted/20 flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_rgb(60_220_175/0.8)]" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-wide">PROCESSOS</span>
              <span className="text-[10px] text-muted-foreground tracking-[0.2em] mt-0.5">
                AXENYA
              </span>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 text-sm">
          <SectionLabel>Operação</SectionLabel>
          <NavLink href="/" exact>
            Visão geral
          </NavLink>
          <NavLink href="/processos">Processos</NavLink>
          <NavLink href="/runs">Execuções</NavLink>

          <SectionLabel className="mt-5">Catálogo</SectionLabel>
          <NavLink href="/skills">Skills</NavLink>
          <NavLink href="/conectores">Conectores</NavLink>
          <NavLink href="/clientes">Clientes</NavLink>

          <SectionLabel className="mt-5">Sistema</SectionLabel>
          <NavLink href="/settings/slack">Slack</NavLink>
        </nav>
        <div className="px-4 py-4 border-t border-border text-xs text-muted-foreground">
          <div className="truncate" title={user.email ?? ""}>
            {user.email}
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 px-3 mb-1 ${className}`}
    >
      {children}
    </div>
  );
}
