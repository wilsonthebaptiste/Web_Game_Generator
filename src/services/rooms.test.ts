import { isAppError } from '../lib/errors'
import type { RoomMembership, RoomSnapshot } from '../types/game'
import { lobbyHost } from '../test/fixtures'
import { createRoom, endGame, getRoomSnapshot, subscribeToRoom } from './rooms'

const { supabase, channel, ensureAnonymousSession } = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  const supabase = {
    rpc: vi.fn(),
    channel: vi.fn((_topic: string) => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  return { supabase, channel, ensureAnonymousSession: vi.fn() }
})

vi.mock('../lib/supabaseClient', () => ({
  getSupabase: () => supabase,
  ensureAnonymousSession,
}))

const membership: RoomMembership = { room: lobbyHost.room, player: lobbyHost.me }
const snapshot: RoomSnapshot = {
  room: lobbyHost.room,
  players: lobbyHost.players,
  currentRound: null,
  me: lobbyHost.me,
  myAnswer: null,
}

function rpcResolves(data: unknown) {
  supabase.rpc.mockResolvedValue({ data, error: null, status: 200 })
}

function rpcFails(message: string, status = 400, code = 'P0001') {
  supabase.rpc.mockResolvedValue({ data: null, error: { message, code }, status })
}

beforeEach(() => {
  vi.clearAllMocks()
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  ensureAnonymousSession.mockResolvedValue('user-1')
})

describe('createRoom', () => {
  it('signs in, calls create_room with the name, and returns the membership', async () => {
    rpcResolves(membership)

    await expect(createRoom({ displayName: 'Ava' })).resolves.toEqual(membership)
    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(supabase.rpc).toHaveBeenCalledWith('create_room', { display_name: 'Ava' })
    expect(ensureAnonymousSession.mock.invocationCallOrder[0]).toBeLessThan(
      supabase.rpc.mock.invocationCallOrder[0],
    )
  })

  it.each([
    ['NAME_INVALID', 'NAME_INVALID'],
    ['RATE_LIMITED', 'RATE_LIMITED'],
    ['CODE_GENERATION_FAILED', 'CODE_GENERATION_FAILED'],
    ['NOT_AUTHENTICATED', 'NOT_AUTHENTICATED'],
  ])('maps the RPC error %s to an AppError', async (raised, expected) => {
    rpcFails(raised)

    const error = await createRoom({ displayName: 'Ava' }).catch((e: unknown) => e)
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({ code: expected })
  })

  it('uses the HTTP status when the error has no known code', async () => {
    rpcFails('Too Many Requests', 429, '')
    await expect(createRoom({ displayName: 'Ava' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })

    rpcFails('upstream connect error', 503, '')
    await expect(createRoom({ displayName: 'Ava' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  })

  it('never exposes a raw Postgres message', async () => {
    rpcFails('duplicate key value violates unique constraint "rooms_code_key"', 409, '23505')

    const error = await createRoom({ displayName: 'Ava' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'UNKNOWN' })
    expect((error as Error).message).not.toMatch(/duplicate|constraint|rooms_code_key/)
  })

  it('maps a failed sign-in to an AppError without calling the RPC', async () => {
    ensureAnonymousSession.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(createRoom({ displayName: 'Ava' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('maps a thrown network error to NETWORK_ERROR', async () => {
    supabase.rpc.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(createRoom({ displayName: 'Ava' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })
})

describe('getRoomSnapshot', () => {
  it('normalizes the code and returns the snapshot', async () => {
    rpcResolves(snapshot)

    await expect(getRoomSnapshot(' abc-de ')).resolves.toEqual(snapshot)
    expect(supabase.rpc).toHaveBeenCalledWith('get_room_snapshot', { code: 'ABCDE' })
  })

  it.each(['NOT_A_MEMBER', 'ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'INVALID_ROOM_CODE'])(
    'maps %s',
    async (code) => {
      rpcFails(code)
      await expect(getRoomSnapshot('ABCDE')).rejects.toMatchObject({ code })
    },
  )
})

describe('endGame', () => {
  it('signs in and calls end_game with the room id', async () => {
    rpcResolves(null)

    await expect(endGame('room-1')).resolves.toBeUndefined()
    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(supabase.rpc).toHaveBeenCalledWith('end_game', { room_id: 'room-1' })
    expect(ensureAnonymousSession.mock.invocationCallOrder[0]).toBeLessThan(
      supabase.rpc.mock.invocationCallOrder[0],
    )
  })

  it.each(['NOT_HOST', 'NOT_A_MEMBER', 'ROOM_NOT_FOUND', 'ROOM_EXPIRED', 'ROOM_FINISHED'])(
    'maps %s',
    async (code) => {
      rpcFails(code)
      const error = await endGame('room-1').catch((e: unknown) => e)
      expect(isAppError(error)).toBe(true)
      expect(error).toMatchObject({ code })
    },
  )

  it('maps a thrown network error to NETWORK_ERROR', async () => {
    supabase.rpc.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(endGame('room-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})

describe('subscribeToRoom', () => {
  it('listens to this room’s rooms and players rows', () => {
    subscribeToRoom('room-1', vi.fn())

    expect(supabase.channel).toHaveBeenCalledOnce()
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.room-1' },
      expect.any(Function),
    )
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.room-1' },
      expect.any(Function),
    )
    expect(channel.subscribe).toHaveBeenCalledOnce()
  })

  it('calls onChange for every change event', () => {
    const onChange = vi.fn()
    subscribeToRoom('room-1', onChange)

    const handlers = channel.on.mock.calls.map((call) => call[2] as (payload: unknown) => void)
    handlers.forEach((handler) => handler({ eventType: 'UPDATE' }))
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('calls onChange when the channel (re)connects, but not on other statuses', () => {
    const onChange = vi.fn()
    subscribeToRoom('room-1', onChange)
    const onStatus = channel.subscribe.mock.calls[0][0] as (status: string) => void

    onStatus('CHANNEL_ERROR')
    onStatus('TIMED_OUT')
    expect(onChange).not.toHaveBeenCalled()

    onStatus('SUBSCRIBED')
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('uses a separate channel topic for each subscription', () => {
    subscribeToRoom('room-1', vi.fn())
    subscribeToRoom('room-1', vi.fn())

    const [first, second] = supabase.channel.mock.calls.map(([topic]) => topic)
    expect(first).toMatch(/^room:room-1:/)
    expect(second).not.toBe(first)
  })

  it('removes the channel on unsubscribe, only once', () => {
    const unsubscribe = subscribeToRoom('room-1', vi.fn())

    unsubscribe()
    unsubscribe()
    expect(supabase.removeChannel).toHaveBeenCalledOnce()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })
})
