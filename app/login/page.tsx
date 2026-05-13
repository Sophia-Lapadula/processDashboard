import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen green-glow grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-2 text-foreground">
          <Logo />
        </div>

        <div className="space-y-6 max-w-md">
          <h1 className="serif text-5xl xl:text-6xl leading-[1.05] tracking-tight">
            Boas-vindas
            <br />
            ao espaço de
            <br />
            processos.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Skills, conectores e processos orquestrados pelo Claude — pra você parar
            de repetir setup manual a cada nova análise.
          </p>
        </div>

        <div className="text-xs text-muted-foreground">
          Plataforma interna Axenya
        </div>
      </section>

      <section className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden mb-8">
            <Logo />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Acesse sua conta</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Entre com seu email para receber um link de acesso.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_rgb(60_220_175/0.8)]" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-wide">PROCESSOS</span>
        <span className="text-xs text-muted-foreground tracking-widest">AXENYA</span>
      </div>
    </div>
  );
}
