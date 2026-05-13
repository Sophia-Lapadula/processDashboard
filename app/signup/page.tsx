import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre-se para acessar a plataforma.
          </p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
