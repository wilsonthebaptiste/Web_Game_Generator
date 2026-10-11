// Reference scoring (plan.md §1.5). These functions document the rules and back the
// golden fixtures in scoring.fixtures.json. The SERVER (`reveal_round`) does the real scoring;
// the UI never sends points. C's SQL parity test runs the same fixtures against the RPC.
import type { GameMode } from '../../../types/game'
import { normalizeAnswer } from './normalize'

/** One submitted answer. Payload is `unknown` because scoring must tolerate bad rows. */
export interface ScoredAnswer {
  playerId: string
  payload: unknown
}

/** Points per player for one round. Every player in the room has an entry (0 if none). */
export type RoundPoints = Record<string, number>

export interface TriviaAnswerKey {
  correctChoiceId: string
}

export interface WordGuessAnswerKey {
  targetAnswer: string
  acceptedAnswers?: string[]
}

export interface SocialAnswerKey {
  allowSelfVote?: boolean
}

function zeroes(playerIds: readonly string[]): RoundPoints {
  return Object.fromEntries(playerIds.map((id) => [id, 0]))
}

function field(payload: unknown, key: string): unknown {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined
}

/**
 * Only the latest answer per player counts (the server upserts on `(round_id, player_id)`),
 * and answers from players not in the room are ignored.
 */
function eligible(answers: readonly ScoredAnswer[], playerIds: readonly string[]): ScoredAnswer[] {
  const latest = new Map<string, ScoredAnswer>()
  for (const answer of answers) {
    if (playerIds.includes(answer.playerId)) latest.set(answer.playerId, answer)
  }
  return [...latest.values()]
}

/** +1 for each player whose `choiceId` equals `correctChoiceId`. */
export function scoreTrivia(
  answers: readonly ScoredAnswer[],
  key: TriviaAnswerKey,
  playerIds: readonly string[],
): RoundPoints {
  const points = zeroes(playerIds)
  for (const { playerId, payload } of eligible(answers, playerIds)) {
    if (field(payload, 'choiceId') === key.correctChoiceId) points[playerId] = 1
  }
  return points
}

/** +1 when the normalized guess equals the normalized target or any accepted variant. */
export function scoreWordGuess(
  answers: readonly ScoredAnswer[],
  key: WordGuessAnswerKey,
  playerIds: readonly string[],
): RoundPoints {
  const points = zeroes(playerIds)
  const accepted = new Set([key.targetAnswer, ...(key.acceptedAnswers ?? [])].map(normalizeAnswer))
  for (const { playerId, payload } of eligible(answers, playerIds)) {
    const text = field(payload, 'text')
    if (typeof text === 'string' && text.trim() !== '' && accepted.has(normalizeAnswer(text))) {
      points[playerId] = 1
    }
  }
  return points
}

/**
 * +1 to the voted player for each vote received. Votes for someone outside the room are
 * ignored, and so are self-votes unless the prompt allows them (the server rejects those at
 * submit time; ignoring them here is defense in depth).
 */
export function scoreSocialVotes(
  answers: readonly ScoredAnswer[],
  key: SocialAnswerKey,
  playerIds: readonly string[],
): RoundPoints {
  const points = zeroes(playerIds)
  for (const { playerId, payload } of eligible(answers, playerIds)) {
    const voted = field(payload, 'votedPlayerId')
    if (typeof voted !== 'string' || !playerIds.includes(voted)) continue
    if (voted === playerId && !key.allowSelfVote) continue
    points[voted] += 1
  }
  return points
}

export type AnswerKey = TriviaAnswerKey | WordGuessAnswerKey | SocialAnswerKey

/** Dispatches to the scorer for `mode`. */
export function scoreRound(
  mode: GameMode,
  answers: readonly ScoredAnswer[],
  key: AnswerKey,
  playerIds: readonly string[],
): RoundPoints {
  switch (mode) {
    case 'trivia':
      return scoreTrivia(answers, key as TriviaAnswerKey, playerIds)
    case 'word-guessing':
      return scoreWordGuess(answers, key as WordGuessAnswerKey, playerIds)
    case 'social':
      return scoreSocialVotes(answers, key as SocialAnswerKey, playerIds)
  }
}
