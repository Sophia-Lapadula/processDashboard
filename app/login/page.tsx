import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Processos Axenya</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com seu email para receber um link de acesso.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
