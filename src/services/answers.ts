// Answer services. Owned by Contributor B.
import type { Json } from '../types/database'
import type { AnswerPayload } from '../types/game'
import { callRoundRpc } from './rounds'

/**
 * Calls `submit_answer`. Inserts or replaces the caller's answer while the round is answering,
 * so editing an answer is the same call. Validate with `validateAnswerPayload` first.
 * There is no `getMyAnswer`: read `session.myAnswer` and call `session.refresh()` after a submit.
 */
export async function submitAnswer(roundId: string, payload: AnswerPayload): Promise<void> {
  await callRoundRpc('submit_answer', { round_id: roundId, payload: payload as unknown as Json })
}
