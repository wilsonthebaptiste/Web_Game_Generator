// Guards the fixtures themselves, so UI tests built on them stay meaningful.
import { GAME_MODES } from '../types/game'
import {
  AVA_ID,
  BEN_ID,
  answeringSessions,
  finishedSingleWinner,
  finishedTie,
  lobbyGuest,
  lobbyHost,
  prompts,
  revealedSessions,
  viewAs,
} from './fixtures'

const ANSWER_FIELDS = ['correctChoiceId', 'targetAnswer', 'acceptedAnswers']

describe('fixtures', () => {
  it('marks only the host as host', () => {
    expect(lobbyHost.isHost).toBe(true)
    expect(lobbyGuest.isHost).toBe(false)
    expect(viewAs(lobbyGuest, AVA_ID).isHost).toBe(true)
  })

  it.each(GAME_MODES)('%s prompt snapshot contains no answer fields', (mode) => {
    const json = JSON.stringify(prompts[mode])
    for (const field of ANSWER_FIELDS) expect(json).not.toContain(field)
    expect(prompts[mode].mode).toBe(mode)
  })

  it.each(GAME_MODES)(
    '%s answering fixtures have no reveal and differ only by my answer',
    (mode) => {
      const { submitted, notSubmitted } = answeringSessions[mode]
      expect(submitted.currentRound?.revealSnapshot).toBeNull()
      expect(submitted.myAnswer).not.toBeNull()
      expect(notSubmitted.myAnswer).toBeNull()
      expect(submitted.me.id).toBe(BEN_ID)
    },
  )

  it.each(GAME_MODES)('%s reveal covers every player and scores add up', (mode) => {
    const before = answeringSessions[mode].notSubmitted.players
    const after = revealedSessions[mode]
    const reveal = after.currentRound?.revealSnapshot
    expect(reveal?.mode).toBe(mode)
    expect(reveal?.results.map((r) => r.playerId).sort()).toEqual(before.map((p) => p.id).sort())

    for (const p of after.players) {
      const previous = before.find((b) => b.id === p.id)!.score
      const points = reveal!.results.find((r) => r.playerId === p.id)!.pointsAwarded
      expect(p.score).toBe(previous + points)
    }
  })

  it('social points equal votes received', () => {
    const results = revealedSessions.social.currentRound!.revealSnapshot!.results
    for (const r of results) {
      const votes = results.filter(
        (v) => v.answer && 'votedPlayerId' in v.answer && v.answer.votedPlayerId === r.playerId,
      ).length
      expect(r.pointsAwarded).toBe(votes)
    }
  })

  it('finished fixtures have the expected top scores', () => {
    const top = (players: { score: number }[]) => Math.max(...players.map((p) => p.score))
    expect(finishedTie.players.filter((p) => p.score === top(finishedTie.players))).toHaveLength(2)
    expect(
      finishedSingleWinner.players.filter((p) => p.score === top(finishedSingleWinner.players)),
    ).toHaveLength(1)
    expect(finishedTie.room.status).toBe('finished')
  })
})
