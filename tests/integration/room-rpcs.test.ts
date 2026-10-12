// create_room, join_room, and get_room_snapshot against a real Supabase instance.
// ROOM_EXPIRED and ROOM_NOT_JOINABLE need a room that has expired or started; clients can't set
// that up yet, so they are added with the round RPCs (feat/round-rpcs).
import type { RoomMembership, RoomSnapshot } from '../../src/types/game'
import { errorOf, newBrowser, signedOutBrowser, type TestClient } from './helpers'

let host: TestClient
let guest: TestClient
let outsider: TestClient
let membership: RoomMembership

beforeAll(async () => {
  ;[host, guest, outsider] = await Promise.all([newBrowser(), newBrowser(), newBrowser()])
  const { data, error } = await host.rpc('create_room', { display_name: '  Ava ' })
  if (error) throw error
  membership = data as unknown as RoomMembership
})

/** A valid-format code that no room uses. A snapshot of a room you're not in says NOT_A_MEMBER. */
async function unusedCode(): Promise<string> {
  for (const candidate of ['ZZZZZ', 'YYYYY', 'XXXXX', 'WWWWW', 'VVVVV']) {
    const message = await errorOf(outsider.rpc('get_room_snapshot', { code: candidate }))
    if (message === 'ROOM_NOT_FOUND') return candidate
  }
  throw new Error('Could not find an unused room code')
}

describe('create_room', () => {
  it('creates a lobby room with the caller as host, trimming the name', () => {
    expect(membership.room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/)
    expect(membership.room.status).toBe('lobby')
    expect(membership.room.hostPlayerId).toBe(membership.player.id)
    expect(membership.player.displayName).toBe('Ava')
    expect(membership.player.score).toBe(0)
  })

  it('rejects an invalid name', async () => {
    expect(await errorOf(host.rpc('create_room', { display_name: '   ' }))).toBe('NAME_INVALID')
    expect(await errorOf(host.rpc('create_room', { display_name: 'x'.repeat(21) }))).toBe(
      'NAME_INVALID',
    )
  })

  it('rejects callers with no session', async () => {
    const { error } = await signedOutBrowser().rpc('create_room', { display_name: 'Nobody' })
    expect(error?.code).toBe('42501') // permission denied
  })

  it('limits each browser to 5 rooms an hour', async () => {
    const spammer = await newBrowser()
    for (let i = 1; i <= 5; i++) {
      const { error } = await spammer.rpc('create_room', { display_name: `Spam ${i}` })
      expect(error).toBeNull()
    }
    expect(await errorOf(spammer.rpc('create_room', { display_name: 'Spam 6' }))).toBe(
      'RATE_LIMITED',
    )
  })
})

describe('join_room', () => {
  it('rejects a badly formatted code', async () => {
    expect(await errorOf(guest.rpc('join_room', { code: 'AB1', display_name: 'Ben' }))).toBe(
      'INVALID_ROOM_CODE',
    )
  })

  it('rejects a code with no room', async () => {
    const code = await unusedCode()
    expect(await errorOf(guest.rpc('join_room', { code, display_name: 'Ben' }))).toBe(
      'ROOM_NOT_FOUND',
    )
  })

  it('rejects a name already used in the room, ignoring case', async () => {
    const { code } = membership.room
    expect(await errorOf(guest.rpc('join_room', { code, display_name: 'AVA' }))).toBe('NAME_TAKEN')
  })

  it('joins with a messy code and returns the same player on rejoin', async () => {
    const { code } = membership.room
    const messy = ` ${code.slice(0, 2).toLowerCase()}-${code.slice(2)} `
    const first = await guest.rpc('join_room', { code: messy, display_name: 'Ben' })
    expect(first.error).toBeNull()
    const joined = first.data as unknown as RoomMembership
    expect(joined.room.id).toBe(membership.room.id)
    expect(joined.player.displayName).toBe('Ben')

    const again = await guest.rpc('join_room', { code, display_name: 'Another name' })
    expect((again.data as unknown as RoomMembership).player.id).toBe(joined.player.id)
  })
})

describe('get_room_snapshot', () => {
  it('returns the room, players in join order, and me', async () => {
    const { data, error } = await guest.rpc('get_room_snapshot', { code: membership.room.code })
    expect(error).toBeNull()
    const snapshot = data as unknown as RoomSnapshot
    expect(snapshot.room.id).toBe(membership.room.id)
    expect(snapshot.players.map((p) => p.displayName)).toEqual(['Ava', 'Ben'])
    expect(snapshot.me?.displayName).toBe('Ben')
    expect(snapshot.currentRound).toBeNull()
    expect(snapshot.myAnswer).toBeNull()
  })

  it('refuses non-members', async () => {
    expect(await errorOf(outsider.rpc('get_room_snapshot', { code: membership.room.code }))).toBe(
      'NOT_A_MEMBER',
    )
  })

  it('rejects malformed and unknown codes', async () => {
    expect(await errorOf(guest.rpc('get_room_snapshot', { code: 'nope' }))).toBe(
      'INVALID_ROOM_CODE',
    )
    const code = await unusedCode()
    expect(await errorOf(guest.rpc('get_room_snapshot', { code }))).toBe('ROOM_NOT_FOUND')
  })
})

describe('direct table access', () => {
  it('lets members read the room but not write to it', async () => {
    const read = await guest
      .from('players')
      .select('display_name')
      .eq('room_id', membership.room.id)
    expect(read.data).toHaveLength(2)

    const write = await guest
      .from('players')
      .update({ score: 99 })
      .eq('room_id', membership.room.id)
    expect(write.error?.code).toBe('42501')
  })

  it('hides the room from non-members', async () => {
    const read = await outsider.from('rooms').select('id').eq('id', membership.room.id)
    expect(read.data).toEqual([])
  })
})
