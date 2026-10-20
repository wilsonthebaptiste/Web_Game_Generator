// Round services. Owned by Contributor B. RPCs are defined in
// supabase/migrations/*_round_rpcs.sql; their results are already camelCase contract shapes.
import { toAppError } from '../lib/errors'
import { ensureAnonymousSession, getSupabase } from '../lib/supabaseClient'
import type { Database } from '../types/database'
import type { GameMode, Round } from '../types/game'

type GeneratedFunctions = Database['public']['Functions']

// `reveal_round` ships in C's `feat/reveal-scoring`. Until the generated types include it, its
// signature comes from plan.md §1.2. Once they do, this entry can be dropped.
type RoundRpcs = Pick<GeneratedFunctions, 'start_round' | 'submit_answer'> & {
  reveal_round: { Args: { round_id: string }; Returns: undefined }
}

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
    // The cast only widens the name for `reveal_round` (see RoundRpcs); args are checked above.
    const { data, error, status } = await getSupabase().rpc(
      fn as keyof GeneratedFunctions,
      args as never,
    )
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
