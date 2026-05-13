import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypassa RLS. Use SOMENTE em:
 *   - Server Actions de mutação que já validaram auth da Sophia
 *   - Workflows internos (execução de processo, cron dispatcher, webhook handler)
 *   - Acesso a conector_secrets (RLS bloqueia o anon role)
 *
 * Nunca exponha pro browser.
 */
export function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurado");
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
