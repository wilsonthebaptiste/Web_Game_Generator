import type { RoomMembership } from '../types/game'
import { lobbyGuest } from '../test/fixtures'
import { joinRoom } from './players'

const { supabase, ensureAnonymousSession } = vi.hoisted(() => ({
  supabase: { rpc: vi.fn() },
  ensureAnonymousSession: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  getSupabase: () => supabase,
  ensureAnonymousSession,
}))

const membership: RoomMembership = { room: lobbyGuest.room, player: lobbyGuest.me }

beforeEach(() => {
  vi.clearAllMocks()
  ensureAnonymousSession.mockResolvedValue('user-2')
})

describe('joinRoom', () => {
  it('signs in, normalizes the code, and returns the membership', async () => {
    supabase.rpc.mockResolvedValue({ data: membership, error: null, status: 200 })

    await expect(joinRoom({ roomCode: 'ab-cde', displayName: 'Ben' })).resolves.toEqual(membership)
    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(supabase.rpc).toHaveBeenCalledWith('join_room', { code: 'ABCDE', display_name: 'Ben' })
  })

  it.each([
    'INVALID_ROOM_CODE',
    'ROOM_NOT_FOUND',
    'ROOM_EXPIRED',
    'ROOM_NOT_JOINABLE',
    'ROOM_FINISHED',
    'NAME_INVALID',
    'NAME_TAKEN',
    'RATE_LIMITED',
  ])('maps the RPC error %s to an AppError with a friendly message', async (code) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: code }, status: 400 })

    const error = await joinRoom({ roomCode: 'ABCDE', displayName: 'Ben' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'AppError', code })
    expect((error as Error).message).not.toBe(code)
  })
})
