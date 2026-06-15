import { createClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Single shared Supabase client for the whole app: auth, Postgres queries,
 * realtime subscriptions, and storage. The anon key is safe in the client —
 * every table is protected by Row Level Security and signups are disabled.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
})
