import type { GameMode } from '../../../types/game'
import fixtures from './scoring.fixtures.json'
import {
  scoreRound,
  scoreSocialVotes,
  scoreTrivia,
  scoreWordGuess,
  type AnswerKey,
  type ScoredAnswer,
} from './scoring'

interface Fixture {
  name: string
  mode: GameMode
  players: string[]
  answerKey: AnswerKey
  answers: ScoredAnswer[]
  expected: Record<string, number>
}

const cases = fixtures.cases as Fixture[]

describe('scoring fixtures', () => {
  it('covers every mode', () => {
    const modes = new Set(cases.map((c) => c.mode))
    expect(modes).toEqual(new Set(['trivia', 'word-guessing', 'social']))
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(c.players.slice().sort()).toEqual(Object.keys(c.expected).sort())
    const playerIdsWithAnswers = c.answers.map((a) => a.playerId)
    expect(new Set(playerIdsWithAnswers).size).toBe(playerIdsWithAnswers.length)

    expect(scoreRound(c.mode, c.answers, c.answerKey, c.players)).toEqual(c.expected)
  })
})

describe('scoring edge cases', () => {
  const players = ['p1', 'p2']

  it('ignores malformed payloads', () => {
    const bad: ScoredAnswer[] = [
      { playerId: 'p1', payload: null },
      { playerId: 'p2', payload: { text: 42 } },
    ]
    expect(scoreTrivia(bad, { correctChoiceId: 'a' }, players)).toEqual({ p1: 0, p2: 0 })
    expect(scoreWordGuess(bad, { targetAnswer: 'x' }, players)).toEqual({ p1: 0, p2: 0 })
    expect(scoreSocialVotes(bad, {}, players)).toEqual({ p1: 0, p2: 0 })
  })

  it('ignores answers from players not in the room', () => {
    const answers: ScoredAnswer[] = [{ playerId: 'ghost', payload: { choiceId: 'a' } }]
    expect(scoreTrivia(answers, { correctChoiceId: 'a' }, players)).toEqual({ p1: 0, p2: 0 })
  })

  it('counts only the latest answer per player', () => {
    const answers: ScoredAnswer[] = [
      { playerId: 'p1', payload: { votedPlayerId: 'p2' } },
      { playerId: 'p1', payload: { votedPlayerId: 'p2' } },
    ]
    expect(scoreSocialVotes(answers, {}, players)).toEqual({ p1: 0, p2: 1 })
  })

  it('never awards a blank word guess, even against a blank key', () => {
    const answers: ScoredAnswer[] = [{ playerId: 'p1', payload: { text: '   ' } }]
    expect(scoreWordGuess(answers, { targetAnswer: '' }, players)).toEqual({ p1: 0, p2: 0 })
  })

  it('returns an empty result for an empty room', () => {
    expect(scoreTrivia([], { correctChoiceId: 'a' }, [])).toEqual({})
  })
})
