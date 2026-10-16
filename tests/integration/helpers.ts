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

/**
 * A client that bypasses RLS, for tests that must write rows no player could (the scoring parity
 * test inserts self-votes and votes from outside the room directly).
 *
 * LOCAL ONLY. The key is the local stack's service-role key from `npx supabase status -o env`
 * (SERVICE_ROLE_KEY), passed as SUPABASE_TEST_SERVICE_ROLE_KEY. It must never be a hosted
 * project's key, so this refuses any URL that isn't localhost.
 */
export function adminClient(): TestClient {
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY from `npx supabase status -o env`.',
    )
  }
  const { hostname } = new URL(url)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`adminClient is for the local Supabase stack only, not ${hostname}.`)
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** True when the tests target the local Supabase stack (needed for adminClient tests). */
export function isLocalStack(): boolean {
  if (!url) return false
  const { hostname } = new URL(url)
  return hostname === '127.0.0.1' || hostname === 'localhost'
}

/** Awaits an RPC call and returns its error message (the AppErrorCode), failing if it succeeded. */
export async function errorOf(
  call: PromiseLike<{ error: { message: string; code?: string } | null }>,
): Promise<string> {
  const { error } = await call
  if (!error) throw new Error('Expected the call to fail, but it succeeded.')
  return error.message
}
