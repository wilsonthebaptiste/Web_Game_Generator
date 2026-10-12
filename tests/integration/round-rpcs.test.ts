// start_round and submit_answer against a real Supabase instance.
// Until reveal_round exists (Phase 3), a room can only play one round, so each mode gets its
// own room. ROUND_NOT_ANSWERING, ROUND_LIMIT_REACHED, and NO_CONTENT_AVAILABLE need reveals and
// are added with feat/reveal-scoring.
import type {
  GameMode,
  RoomMembership,
  RoomSnapshot,
  Round,
  SocialPromptSnapshot,
  TriviaPromptSnapshot,
} from '../../src/types/game'
import { errorOf, newBrowser, type TestClient } from './helpers'

let host: TestClient
let guest: TestClient
let outsider: TestClient
const rooms = {} as Record<GameMode, RoomMembership>
let guestPlayerId: string

async function createRoom(): Promise<RoomMembership> {
  const { data, error } = await host.rpc('create_room', { display_name: 'Host' })
  if (error) throw error
  return data as unknown as RoomMembership
}

async function start(room: RoomMembership, mode: GameMode): Promise<Round> {
  const { data, error } = await host.rpc('start_round', { room_id: room.room.id, mode })
  if (error) throw error
  return data as unknown as Round
}

beforeAll(async () => {
  ;[host, guest, outsider] = await Promise.all([newBrowser(), newBrowser(), newBrowser()])
  for (const mode of ['trivia', 'word-guessing', 'social'] as const) {
    rooms[mode] = await createRoom()
    const { data, error } = await guest.rpc('join_room', {
      code: rooms[mode].room.code,
      display_name: 'Guest',
    })
    if (error) throw error
    guestPlayerId = (data as unknown as RoomMembership).player.id
  }
})

describe('start_round', () => {
  it('needs at least two players', async () => {
    const lonely = await createRoom()
    expect(
      await errorOf(host.rpc('start_round', { room_id: lonely.room.id, mode: 'trivia' })),
    ).toBe('NOT_ENOUGH_PLAYERS')
  })

  it('is host only', async () => {
    const room_id = rooms.trivia.room.id
    expect(await errorOf(guest.rpc('start_round', { room_id, mode: 'trivia' }))).toBe('NOT_HOST')
    expect(await errorOf(outsider.rpc('start_round', { room_id, mode: 'trivia' }))).toBe(
      'NOT_A_MEMBER',
    )
  })

  it('rejects an unknown mode', async () => {
    expect(
      await errorOf(host.rpc('start_round', { room_id: rooms.trivia.room.id, mode: 'chess' })),
    ).toBe('INVALID_MODE')
  })

  it('starts round 1 with a prompt and no answer, and closes the lobby', async () => {
    const round = await start(rooms.trivia, 'trivia')
    expect(round).toMatchObject({ roundNumber: 1, mode: 'trivia', status: 'answering' })
    expect((round.promptSnapshot as TriviaPromptSnapshot).choices.length).toBeGreaterThan(1)
    expect(JSON.stringify(round)).not.toContain('correctChoiceId')

    expect(
      await errorOf(host.rpc('start_round', { room_id: rooms.trivia.room.id, mode: 'trivia' })),
    ).toBe('ROUND_IN_PROGRESS')
    expect(
      await errorOf(
        outsider.rpc('join_room', { code: rooms.trivia.room.code, display_name: 'Late' }),
      ),
    ).toBe('ROOM_NOT_JOINABLE')
  })
})

describe('submit_answer', () => {
  it('accepts, edits, and counts trivia answers without exposing them', async () => {
    const snapshot = (await guest.rpc('get_room_snapshot', { code: rooms.trivia.room.code }))
      .data as unknown as RoomSnapshot
    const round = snapshot.currentRound!
    const [first, second] = (round.promptSnapshot as TriviaPromptSnapshot).choices

    expect(
      await errorOf(
        guest.rpc('submit_answer', { round_id: round.id, payload: { choiceId: 'zzz' } }),
      ),
    ).toBe('INVALID_ANSWER')
    expect(
      await errorOf(
        outsider.rpc('submit_answer', { round_id: round.id, payload: { choiceId: first.id } }),
      ),
    ).toBe('NOT_A_MEMBER')

    for (const choice of [first, second]) {
      const { error } = await guest.rpc('submit_answer', {
        round_id: round.id,
        payload: { choiceId: choice.id },
      })
      expect(error).toBeNull()
    }
    await host.rpc('submit_answer', { round_id: round.id, payload: { choiceId: first.id } })

    const after = (await guest.rpc('get_room_snapshot', { code: rooms.trivia.room.code }))
      .data as unknown as RoomSnapshot
    expect(after.myAnswer).toEqual({ choiceId: second.id })
    expect(after.currentRound?.submissionCount).toBe(2)

    // RLS: the guest sees only their own answer row, and never the answer key.
    expect((await guest.from('answers').select('*').eq('round_id', round.id)).data).toHaveLength(1)
    expect((await guest.from('round_secrets').select('*')).error?.code).toBe('42501')
  })

  it('trims word guesses and enforces the length limit', async () => {
    const round = await start(rooms['word-guessing'], 'word-guessing')
    expect(
      await errorOf(guest.rpc('submit_answer', { round_id: round.id, payload: { text: '   ' } })),
    ).toBe('INVALID_ANSWER')
    expect(
      await errorOf(
        guest.rpc('submit_answer', { round_id: round.id, payload: { text: 'x'.repeat(61) } }),
      ),
    ).toBe('INVALID_ANSWER')

    await guest.rpc('submit_answer', { round_id: round.id, payload: { text: '  Banana  ' } })
    const snapshot = (
      await guest.rpc('get_room_snapshot', { code: rooms['word-guessing'].room.code })
    ).data as unknown as RoomSnapshot
    expect(snapshot.myAnswer).toEqual({ text: 'Banana' })
  })

  it('validates votes, including self-votes', async () => {
    const round = await start(rooms.social, 'social')
    const vote = (votedPlayerId: string) =>
      guest.rpc('submit_answer', { round_id: round.id, payload: { votedPlayerId } })

    expect(await errorOf(vote('not-a-player'))).toBe('INVALID_ANSWER')
    const selfVote = await vote(guestPlayerId)
    if ((round.promptSnapshot as SocialPromptSnapshot).allowSelfVote) {
      expect(selfVote.error).toBeNull()
    } else {
      expect(selfVote.error?.message).toBe('SELF_VOTE_NOT_ALLOWED')
    }
    expect((await vote(rooms.social.player.id)).error).toBeNull()
  })
})
