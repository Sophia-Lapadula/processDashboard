import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem envs do Supabase → retorna página explicativa em vez de crashar
  // com MIDDLEWARE_INVOCATION_FAILED.
  if (!supabaseUrl || !supabaseAnon) {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Configuração pendente</title>
      <style>body{font:14px/1.5 system-ui;max-width:560px;margin:80px auto;padding:0 20px;color:#222}
      code{background:#f0ede5;padding:2px 6px;border-radius:4px;font-size:12px}
      h1{font-size:20px}ul{padding-left:18px}</style>
      <h1>Configuração pendente</h1>
      <p>O middleware não conseguiu inicializar o Supabase.
      Configure as variáveis de ambiente no Vercel:</p>
      <ul>
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
        <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
        <li><code>SUPABASE_SERVICE_ROLE_KEY</code></li>
        <li><code>ANTHROPIC_API_KEY</code></li>
        <li><code>SECRETS_ENCRYPTION_KEY</code></li>
        <li><code>PLATFORM_SIGNING_SECRET</code></li>
        <li><code>CRON_SECRET</code></li>
        <li><code>NEXT_PUBLIC_APP_URL</code></li>
      </ul>
      <p>Em <em>Project Settings → Environment Variables</em>, depois redeploy.</p>`,
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/triggers/") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
