// What a browser can and can't do, whatever it sends (plan.md Phase 4, `test/rls-security`).
// Runs against local Supabase or `dev`. The expired-room section needs the local stack, because
// only the local service-role key can move a room's expiry into the past.
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RoomMembership,
  RoomSnapshot,
  Round,
  TriviaPromptSnapshot,
} from '../../src/types/game'
import {
  adminClient,
  errorOf,
  isLocalStack,
  newBrowser,
  signedOutBrowser,
  type TestClient,
} from './helpers'

const TABLES = ['rooms', 'players', 'rounds', 'answers', 'content_items', 'round_secrets'] as const
const ANSWER_KEY_FIELDS = ['correctChoiceId', 'targetAnswer', 'acceptedAnswers', 'answerKey']

let host: TestClient
let guest: TestClient
let outsider: TestClient
let room: RoomMembership
let guestPlayerId: string
let round: Round
let choiceId: string

/** The same client without generated types, so tests can name tables and columns freely. */
const untyped = (client: TestClient) => client as unknown as SupabaseClient

async function snapshot(client: TestClient): Promise<RoomSnapshot> {
  const { data, error } = await client.rpc('get_room_snapshot', { code: room.room.code })
  if (error) throw error
  return data as unknown as RoomSnapshot
}

beforeAll(async () => {
  ;[host, guest, outsider] = await Promise.all([newBrowser(), newBrowser(), newBrowser()])
  room = (await host.rpc('create_room', { display_name: 'Ava' })).data as unknown as RoomMembership
  const joined = await guest.rpc('join_room', { code: room.room.code, display_name: 'Ben' })
  if (joined.error) throw joined.error
  guestPlayerId = (joined.data as unknown as RoomMembership).player.id
  const started = await host.rpc('start_round', { room_id: room.room.id, mode: 'trivia' })
  if (started.error) throw started.error
  round = started.data as unknown as Round
  choiceId = (round.promptSnapshot as TriviaPromptSnapshot).choices[0].id
  await host.rpc('submit_answer', { round_id: round.id, payload: { choiceId } })
  await guest.rpc('submit_answer', { round_id: round.id, payload: { choiceId } })
})

describe('signed-out browsers', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    const { error } = await untyped(signedOutBrowser()).from(table).select('*').limit(1)
    expect(error?.code).toBe('42501')
  })

  it('cannot call any RPC', async () => {
    const anon = signedOutBrowser()
    const id = randomUUID()
    const calls = [
      anon.rpc('create_room', { display_name: 'Nobody' }),
      anon.rpc('join_room', { code: room.room.code, display_name: 'Nobody' }),
      anon.rpc('get_room_snapshot', { code: room.room.code }),
      anon.rpc('start_round', { room_id: id, mode: 'trivia' }),
      anon.rpc('submit_answer', { round_id: id, payload: {} }),
      anon.rpc('reveal_round', { round_id: id }),
      anon.rpc('end_game', { room_id: id }),
    ]
    for (const { error } of await Promise.all(calls)) expect(error?.code).toBe('42501')
  })
})

describe('non-members', () => {
  it('see no rows from the room in any table', async () => {
    const reads = [
      untyped(outsider).from('rooms').select('id').eq('id', room.room.id),
      untyped(outsider).from('players').select('id').eq('room_id', room.room.id),
      untyped(outsider).from('rounds').select('id').eq('room_id', room.room.id),
      untyped(outsider).from('answers').select('id').eq('round_id', round.id),
    ]
    for (const { data, error } of await Promise.all(reads)) {
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  it('cannot read the snapshot or act in the room', async () => {
    expect(await errorOf(outsider.rpc('get_room_snapshot', { code: room.room.code }))).toBe(
      'NOT_A_MEMBER',
    )
    expect(
      await errorOf(outsider.rpc('submit_answer', { round_id: round.id, payload: { choiceId } })),
    ).toBe('NOT_A_MEMBER')
    expect(
      await errorOf(outsider.rpc('start_round', { room_id: room.room.id, mode: 'social' })),
    ).toBe('NOT_A_MEMBER')
    expect(await errorOf(outsider.rpc('reveal_round', { round_id: round.id }))).toBe('NOT_A_MEMBER')
    expect(await errorOf(outsider.rpc('end_game', { room_id: room.room.id }))).toBe('NOT_A_MEMBER')
  })
})

describe('members', () => {
  it.each(['round_secrets', 'content_items'] as const)('cannot read %s', async (table) => {
    const { error } = await untyped(guest).from(table).select('*').limit(1)
    expect(error?.code).toBe('42501')
  })

  it("see only their own answer, never another player's", async () => {
    const { data, error } = await untyped(guest)
      .from('answers')
      .select('player_id')
      .eq('round_id', round.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ player_id: guestPlayerId }])
  })

  it('never see the answer key before the reveal', async () => {
    const rows = await untyped(guest).from('rounds').select('*').eq('id', round.id)
    const current = (await snapshot(guest)).currentRound!
    expect(current.revealSnapshot).toBeNull()
    expect(rows.data?.[0]?.reveal_snapshot).toBeNull()
    const visible = JSON.stringify([rows.data, current])
    for (const field of ANSWER_KEY_FIELDS) expect(visible).not.toContain(`"${field}"`)
  })

  it('cannot call host-only RPCs', async () => {
    expect(await errorOf(guest.rpc('start_round', { room_id: room.room.id, mode: 'social' }))).toBe(
      'NOT_HOST',
    )
    expect(await errorOf(guest.rpc('reveal_round', { round_id: round.id }))).toBe('NOT_HOST')
    expect(await errorOf(guest.rpc('end_game', { room_id: room.room.id }))).toBe('NOT_HOST')
  })
})

describe('direct writes', () => {
  // One row shape per table. Tried as the host, the most trusted browser in the room.
  const targets = () => ({
    rooms: { column: 'id', value: room.room.id, change: { status: 'finished' } },
    players: { column: 'id', value: guestPlayerId, change: { score: 99 } },
    rounds: { column: 'id', value: round.id, change: { status: 'revealed' } },
    answers: { column: 'round_id', value: round.id, change: { points_awarded: 5 } },
    content_items: { column: 'mode', value: 'trivia', change: { active: false } },
    round_secrets: { column: 'round_id', value: round.id, change: { answer_key: {} } },
  })

  it.each(TABLES)('are refused on %s (insert, update, delete)', async (table) => {
    const { column, value, change } = targets()[table]
    const db = untyped(host).from(table)
    const attempts = [
      db.insert({ [column]: value, ...change }),
      db.update(change).eq(column, value),
      db.delete().eq(column, value),
    ]
    for (const { error } of await Promise.all(attempts)) expect(error?.code).toBe('42501')
  })

  it('leave scores and round state untouched', async () => {
    const after = await snapshot(host)
    expect(after.players.map((p) => p.score)).toEqual([0, 0])
    expect(after.currentRound?.status).toBe('answering')
    expect(after.room.status).toBe('playing')
  })

  it('cannot reach private helpers through the API', async () => {
    const hidden = await untyped(host).rpc('require_under_limit', {
      p_action: 'create_room',
      p_uid: randomUUID(),
    })
    expect(hidden.error?.code).toBe('PGRST202') // not in the exposed schema
    const schema = await untyped(host)
      .schema('private')
      .rpc('is_room_member', { p_room_id: room.room.id })
    expect(schema.error?.code).toBe('PGRST106') // schema not exposed
  })
})

// Last, because it ends the game in the shared room.
describe('finished rooms', () => {
  it('reject answers, reveals, and new rounds', async () => {
    expect((await host.rpc('end_game', { room_id: room.room.id })).error).toBeNull()
    expect(
      await errorOf(guest.rpc('submit_answer', { round_id: round.id, payload: { choiceId } })),
    ).toBe('ROOM_FINISHED')
    expect(await errorOf(host.rpc('reveal_round', { round_id: round.id }))).toBe('ROOM_FINISHED')
    expect(await errorOf(host.rpc('start_round', { room_id: room.room.id, mode: 'social' }))).toBe(
      'ROOM_FINISHED',
    )
  })
})

describe.skipIf(!isLocalStack())('expired rooms (local only)', () => {
  it('are refused by every room RPC', async () => {
    const created = await host.rpc('create_room', { display_name: 'Ava' })
    if (created.error) throw created.error
    const old = created.data as unknown as RoomMembership
    await guest.rpc('join_room', { code: old.room.code, display_name: 'Ben' })
    const started = await host.rpc('start_round', { room_id: old.room.id, mode: 'trivia' })
    if (started.error) throw started.error
    const oldRound = started.data as unknown as Round

    const { error } = await adminClient()
      .from('rooms')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', old.room.id)
    if (error) throw error

    const id = { room_id: old.room.id }
    const calls = [
      outsider.rpc('join_room', { code: old.room.code, display_name: 'Cleo' }),
      guest.rpc('get_room_snapshot', { code: old.room.code }),
      host.rpc('start_round', { ...id, mode: 'social' }),
      guest.rpc('submit_answer', { round_id: oldRound.id, payload: { choiceId: 'a' } }),
      host.rpc('reveal_round', { round_id: oldRound.id }),
      host.rpc('end_game', id),
    ]
    for (const call of calls) expect(await errorOf(call)).toBe('ROOM_EXPIRED')
  })
})
