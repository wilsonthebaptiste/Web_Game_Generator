// STUB from chore/scaffold. Ownership passes to Contributor B once the scaffold merges.
// Implement against the RPCs in plan.md §1.2. Keep these signatures; changing them is a
// contract change (plan.md §9 rule 1).
import type { AnswerPayload } from '../types/game'

/** Calls `submit_answer`. Inserts or replaces the caller's answer while the round is answering. */
export async function submitAnswer(_roundId: string, _payload: AnswerPayload): Promise<void> {
  throw new Error('not implemented')
}
