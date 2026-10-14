import type { AnswerPayload, Player, PromptSnapshot } from '../../types/game'

/** Readable text for an answer, using the prompt for choice labels and the players for names. */
export function answerLabel(
  answer: AnswerPayload | null,
  prompt: PromptSnapshot,
  players: readonly Player[],
): string {
  if (answer === null) return 'No answer'
  if ('choiceId' in answer) {
    const choices = prompt.mode === 'trivia' ? prompt.choices : []
    return choices.find((c) => c.id === answer.choiceId)?.label ?? answer.choiceId
  }
  if ('text' in answer) return answer.text.trim()
  return playerName(answer.votedPlayerId, players)
}

/** Display name for a player ID, with a fallback for someone no longer in the list. */
export function playerName(playerId: string, players: readonly Player[]): string {
  return players.find((p) => p.id === playerId)?.displayName ?? 'A player who left'
}
