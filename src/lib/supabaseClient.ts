import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Typed with the generated `Database` type once `src/types/database.ts` exists (feat/initial-schema).
let client: SupabaseClient | null = null
let pendingSession: Promise<string> | null = null

/**
 * Returns the shared Supabase client. Created lazily so that importing a service
 * module (e.g. in tests or a build without `.env`) never throws.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error(
        'Supabase is not configured. Copy .env.example to .env and fill in the dev project values.',
      )
    }
    client = createClient(url, anonKey)
  }
  return client
}

/**
 * Makes sure this browser has a Supabase anonymous session and returns its user id
 * (`auth.uid()` on the server). supabase-js restores an existing session from local
 * storage, so a refresh keeps the same identity.
 *
 * Concurrent callers share one in-flight request, so React StrictMode's double effects
 * can't create two anonymous users.
 */
export function ensureAnonymousSession(): Promise<string> {
  pendingSession ??= signInIfNeeded().finally(() => {
    pendingSession = null
  })
  return pendingSession
}

async function signInIfNeeded(): Promise<string> {
  const supabase = getSupabase()

  const { data: existing, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (existing.session) return existing.session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('Anonymous sign-in returned no user.')
  return data.user.id
}
