// STUB from chore/scaffold. Ownership passes to Contributor B once the scaffold merges.
// Implement against the RPCs in plan.md §1.2. Keep these signatures; changing them is a
// contract change (plan.md §9 rule 1).
import type { GameMode, Round } from '../types/game'

/** Calls `start_round`. Host only. The server picks the content item. */
export async function startRound(_roomId: string, _mode: GameMode): Promise<Round> {
  throw new Error('not implemented')
}

/** Calls `reveal_round`. Host only. Locks the round and scores it on the server. */
export async function revealRound(_roundId: string): Promise<void> {
  throw new Error('not implemented')
}
