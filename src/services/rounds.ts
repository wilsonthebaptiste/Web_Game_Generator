// Round services. Owned by Contributor B. RPCs are defined in
// supabase/migrations/*_round_rpcs.sql; their results are already camelCase contract shapes.
import { toAppError } from '../lib/errors'
import { ensureAnonymousSession, getSupabase } from '../lib/supabaseClient'
import type { Database } from '../types/database'
import type { GameMode, Round } from '../types/game'

type RoundRpcs = Pick<
  Database['public']['Functions'],
  'start_round' | 'submit_answer' | 'reveal_round'
>

/**
 * Calls a round RPC as this browser's anonymous user. Every failure, including sign-in and
 * network errors, is rethrown as an AppError with a friendly message.
 * Shared with `answers.ts`; not for use outside the round services.
 */
export async function callRoundRpc<Fn extends keyof RoundRpcs>(
  fn: Fn,
  args: RoundRpcs[Fn]['Args'],
): Promise<unknown> {
  try {
    await ensureAnonymousSession()
    const { data, error, status } = await getSupabase().rpc(fn, args)
    if (error) throw toAppError(error, status)
    return data
  } catch (error) {
    throw toAppError(error)
  }
}

/** Calls `start_round`. Host only. The server picks the content item. */
export async function startRound(roomId: string, mode: GameMode): Promise<Round> {
  const data = await callRoundRpc('start_round', { room_id: roomId, mode })
  return data as Round
}

/** Calls `reveal_round`. Host only. Locks the round and scores it on the server. */
export async function revealRound(roundId: string): Promise<void> {
  await callRoundRpc('reveal_round', { round_id: roundId })
}
