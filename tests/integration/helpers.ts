import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database'

// `npm run test:db` targets the Supabase instance in these env vars:
//   local (Docker):  values from `npx supabase status -o env` (API_URL, ANON_KEY)
//   dev project:     the same values as VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env
// Each test file signs in a handful of anonymous users. Hosted projects allow 30 anonymous
// sign-ins per hour per IP, so don't run the suite against `dev` many times in a row.
const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY

export type TestClient = SupabaseClient<Database>

function client(): TestClient {
  if (!url || !anonKey) {
    throw new Error(
      'Set SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY to run database tests (see docs/dev-notes.md).',
    )
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A client with its own anonymous identity, like a separate browser. */
export async function newBrowser(): Promise<TestClient> {
  const c = client()
  const { error } = await c.auth.signInAnonymously()
  if (error) throw error
  return c
}

/** A client with no session at all. */
export function signedOutBrowser(): TestClient {
  return client()
}

/** Awaits an RPC call and returns its error message (the AppErrorCode), failing if it succeeded. */
export async function errorOf(
  call: PromiseLike<{ error: { message: string; code?: string } | null }>,
): Promise<string> {
  const { error } = await call
  if (!error) throw new Error('Expected the call to fail, but it succeeded.')
  return error.message
}
