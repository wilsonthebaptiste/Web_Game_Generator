import { finishedSingleWinner, finishedTie, revealedSessions } from '../../test/fixtures'
import type { Player } from '../../types/game'
import { computeWinners, rankPlayers, roundPoints } from './winners'

const names = (players: Player[]) => players.map((p) => p.displayName)
const withScores = (players: Player[], scores: number[]) =>
  players.map((p, i) => ({ ...p, score: scores[i] }))

describe('computeWinners', () => {
  it('returns the single top scorer', () => {
    expect(names(computeWinners(finishedSingleWinner.players))).toEqual(['Ava'])
  })

  it('returns everyone tied for the top score, in join order', () => {
    expect(names(computeWinners(finishedTie.players))).toEqual(['Ava', 'Ben'])
    const reversed = [...finishedTie.players].reverse()
    expect(names(computeWinners(reversed))).toEqual(['Ava', 'Ben'])
  })

  it('makes everyone a winner when all scores are 0', () => {
    const players = withScores(finishedTie.players, [0, 0, 0])
    expect(names(computeWinners(players))).toEqual(['Ava', 'Ben', 'Cleo'])
  })

  it('returns an empty list when there are no players', () => {
    expect(computeWinners([])).toEqual([])
  })

  it('does not reorder the array passed in', () => {
    const players = withScores(finishedTie.players, [1, 5, 3])
    computeWinners(players)
    rankPlayers(players)
    expect(names(players)).toEqual(['Ava', 'Ben', 'Cleo'])
  })
})

describe('rankPlayers', () => {
  it('sorts by score and gives tied players the same rank', () => {
    const players = withScores(finishedTie.players, [2, 5, 5])
    expect(rankPlayers(players).map((r) => [r.player.displayName, r.rank, r.tied])).toEqual([
      ['Ben', 1, true],
      ['Cleo', 1, true],
      ['Ava', 3, false],
    ])
  })

  it('skips ranks after a tie lower down', () => {
    const players = withScores(finishedTie.players, [4, 1, 1])
    expect(rankPlayers(players).map((r) => r.rank)).toEqual([1, 2, 2])
  })
})

describe('roundPoints', () => {
  it('maps each player id to the points from the reveal', () => {
    expect(roundPoints(revealedSessions.social.currentRound!.revealSnapshot)).toEqual({
      'player-ava': 1,
      'player-ben': 2,
      'player-cleo': 0,
    })
  })

  it('is empty without a reveal', () => {
    expect(roundPoints(null)).toEqual({})
  })
})
