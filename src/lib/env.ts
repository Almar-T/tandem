/**
 * Typed access to build-time public env vars. Fails loudly in dev if the
 * Supabase config is missing, so a misconfigured deploy is obvious immediately.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local (dev) or GitHub repo Variables (prod).`,
    )
  }
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  // Optional until push is wired up in Phase 8.
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
}
