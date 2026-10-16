// reveal_round and end_game as real players. Runs against local Supabase or `dev`.
// Scoring rules themselves are checked case by case in scoring.parity.test.ts (local only).
import type {
  RoomMembership,
  RoomSnapshot,
  Round,
  TriviaRevealSnapshot,
  TriviaPromptSnapshot,
} from '../../src/types/game'
import { errorOf, newBrowser, type TestClient } from './helpers'

let host: TestClient
let guest: TestClient
let third: TestClient
let room: RoomMembership

async function snapshot(client: TestClient): Promise<RoomSnapshot> {
  const { data, error } = await client.rpc('get_room_snapshot', { code: room.room.code })
  if (error) throw error
  return data as unknown as RoomSnapshot
}

async function start(mode: 'trivia' | 'word-guessing' | 'social'): Promise<Round> {
  const { data, error } = await host.rpc('start_round', { room_id: room.room.id, mode })
  if (error) throw error
  return data as unknown as Round
}

beforeAll(async () => {
  ;[host, guest, third] = await Promise.all([newBrowser(), newBrowser(), newBrowser()])
  room = (await host.rpc('create_room', { display_name: 'Ava' })).data as unknown as RoomMembership
  await guest.rpc('join_room', { code: room.room.code, display_name: 'Ben' })
  await third.rpc('join_room', { code: room.room.code, display_name: 'Cleo' })
})

describe('reveal_round', () => {
  let round: Round

  beforeAll(async () => {
    round = await start('trivia')
    const choices = (round.promptSnapshot as TriviaPromptSnapshot).choices
    // Ava and Ben answer differently; Cleo doesn't answer.
    await host.rpc('submit_answer', { round_id: round.id, payload: { choiceId: choices[0].id } })
    await guest.rpc('submit_answer', { round_id: round.id, payload: { choiceId: choices[1].id } })
  })

  it('is host only', async () => {
    expect(await errorOf(guest.rpc('reveal_round', { round_id: round.id }))).toBe('NOT_HOST')
  })

  it('scores the round once and shows every answer', async () => {
    expect((await host.rpc('reveal_round', { round_id: round.id })).error).toBeNull()

    const after = await snapshot(guest)
    const reveal = after.currentRound!.revealSnapshot as TriviaRevealSnapshot
    expect(after.currentRound!.status).toBe('revealed')
    expect(reveal.mode).toBe('trivia')
    expect(reveal.results.map((r) => r.playerId)).toEqual(after.players.map((p) => p.id))

    const [ava, ben, cleo] = reveal.results
    expect(cleo).toMatchObject({ answer: null, pointsAwarded: 0, isCorrect: false })
    // Exactly one of Ava and Ben can be right, or neither.
    const correct = [ava, ben].filter((r) => r.isCorrect)
    expect(correct.length).toBeLessThanOrEqual(1)
    for (const r of reveal.results) expect(r.pointsAwarded).toBe(r.isCorrect ? 1 : 0)
    expect(after.players.map((p) => p.score)).toEqual(reveal.results.map((r) => r.pointsAwarded))
  })

  it('never scores a round twice', async () => {
    const before = (await snapshot(host)).players.map((p) => p.score)
    expect(await errorOf(host.rpc('reveal_round', { round_id: round.id }))).toBe(
      'ROUND_ALREADY_REVEALED',
    )
    expect((await snapshot(host)).players.map((p) => p.score)).toEqual(before)
  })

  it('locks answers after the reveal', async () => {
    const choiceId = (round.promptSnapshot as TriviaPromptSnapshot).choices[0].id
    expect(
      await errorOf(guest.rpc('submit_answer', { round_id: round.id, payload: { choiceId } })),
    ).toBe('ROUND_NOT_ANSWERING')
  })

  it('lets the host start the next round, and scores carry over', async () => {
    const before = (await snapshot(host)).players.map((p) => p.score)
    const next = await start('social')
    expect(next.roundNumber).toBe(2)
    await host.rpc('submit_answer', {
      round_id: next.id,
      payload: { votedPlayerId: (await snapshot(host)).players[1].id },
    })
    await host.rpc('reveal_round', { round_id: next.id })
    const after = (await snapshot(host)).players.map((p) => p.score)
    expect(after).toEqual([before[0], before[1] + 1, before[2]])
  })
})

describe('end_game', () => {
  it('is host only', async () => {
    expect(await errorOf(guest.rpc('end_game', { room_id: room.room.id }))).toBe('NOT_HOST')
  })

  it('finishes the room, keeps scores, and closes it to new rounds and players', async () => {
    const scores = (await snapshot(host)).players.map((p) => p.score)
    expect((await host.rpc('end_game', { room_id: room.room.id })).error).toBeNull()
    expect((await host.rpc('end_game', { room_id: room.room.id })).error).toBeNull()

    const after = await snapshot(guest)
    expect(after.room.status).toBe('finished')
    expect(after.players.map((p) => p.score)).toEqual(scores)
    expect(await errorOf(host.rpc('start_round', { room_id: room.room.id, mode: 'trivia' }))).toBe(
      'ROOM_FINISHED',
    )

    const late = await newBrowser()
    expect(
      await errorOf(late.rpc('join_room', { code: room.room.code, display_name: 'Late' })),
    ).toBe('ROOM_FINISHED')
  })
})
