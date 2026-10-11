import type { AnswerPayload, GameMode } from '../../../types/game'

export const WORD_GUESS_MIN_LENGTH = 1
export const WORD_GUESS_MAX_LENGTH = 60

export interface ValidationContext {
  /** The caller's player ID. Used to reject self-votes. */
  myPlayerId: string
  /** Every player in the room. Votes must name one of them. */
  playerIds: readonly string[]
  /** Trivia: the choice IDs in the prompt snapshot. When given, the choice must be one of them. */
  choiceIds?: readonly string[]
  /** Social: the prompt allows voting for yourself. */
  allowSelfVote?: boolean
}

export type ValidationResult =
  { ok: true; value: AnswerPayload } | { ok: false; code: 'INVALID_ANSWER'; reason: string }

const invalid = (reason: string): ValidationResult => ({
  ok: false,
  code: 'INVALID_ANSWER',
  reason,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Client-side check before `submitAnswer`. The server (`submit_answer`) repeats every check,
 * so this exists for fast, friendly feedback, not for security. Returns a clean payload with
 * only the field for the mode (word guesses are trimmed).
 */
export function validateAnswerPayload(
  mode: GameMode,
  payload: unknown,
  context: ValidationContext,
): ValidationResult {
  if (!isRecord(payload)) return invalid('Choose or enter an answer first.')

  switch (mode) {
    case 'trivia': {
      const { choiceId } = payload
      if (typeof choiceId !== 'string' || choiceId.trim() === '') {
        return invalid('Pick one of the choices.')
      }
      if (context.choiceIds && !context.choiceIds.includes(choiceId)) {
        return invalid('That choice is not part of this question.')
      }
      return { ok: true, value: { choiceId } }
    }

    case 'word-guessing': {
      const { text } = payload
      if (typeof text !== 'string') return invalid('Type a guess.')
      const trimmed = text.trim()
      if (trimmed.length < WORD_GUESS_MIN_LENGTH) return invalid('Type a guess.')
      if (trimmed.length > WORD_GUESS_MAX_LENGTH) {
        return invalid(`Keep your guess to ${WORD_GUESS_MAX_LENGTH} characters or fewer.`)
      }
      return { ok: true, value: { text: trimmed } }
    }

    case 'social': {
      const { votedPlayerId } = payload
      if (typeof votedPlayerId !== 'string' || votedPlayerId === '') {
        return invalid('Pick a player to vote for.')
      }
      if (!context.playerIds.includes(votedPlayerId)) {
        return invalid('That player is not in this room.')
      }
      if (votedPlayerId === context.myPlayerId && !context.allowSelfVote) {
        return invalid('You can’t vote for yourself on this prompt.')
      }
      return { ok: true, value: { votedPlayerId } }
    }

    default:
      return invalid('Unsupported game mode.')
  }
}
