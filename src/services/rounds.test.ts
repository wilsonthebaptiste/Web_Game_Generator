import { isAppError } from '../lib/errors'
import type { AppErrorCode, Round } from '../types/game'
import { answeringSessions } from '../test/fixtures'
import { submitAnswer } from './answers'
import { revealRound, startRound } from './rounds'

const { supabase, ensureAnonymousSession } = vi.hoisted(() => ({
  supabase: { rpc: vi.fn() },
  ensureAnonymousSession: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  getSupabase: () => supabase,
  ensureAnonymousSession,
}))

const round = answeringSessions.trivia.notSubmitted.currentRound as Round

function rpcResolves(data: unknown) {
  supabase.rpc.mockResolvedValue({ data, error: null, status: 200 })
}

function rpcFails(message: string, status = 400, code = 'P0001') {
  supabase.rpc.mockResolvedValue({ data: null, error: { message, code }, status })
}

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode) {
  const error = await promise.then(
    () => {
      throw new Error('expected the call to fail')
    },
    (caught: unknown) => caught,
  )
  expect(isAppError(error)).toBe(true)
  expect((error as { code: string }).code).toBe(code)
}

beforeEach(() => {
  vi.clearAllMocks()
  ensureAnonymousSession.mockResolvedValue('user-1')
})

describe('startRound', () => {
  it('signs in, calls start_round with the room and mode, and returns the round', async () => {
    rpcResolves(round)

    await expect(startRound('room-1', 'trivia')).resolves.toEqual(round)
    expect(supabase.rpc).toHaveBeenCalledWith('start_round', { room_id: 'room-1', mode: 'trivia' })
    expect(ensureAnonymousSession.mock.invocationCallOrder[0]).toBeLessThan(
      supabase.rpc.mock.invocationCallOrder[0],
    )
  })

  it.each<AppErrorCode>([
    'NOT_HOST',
    'ROUND_LIMIT_REACHED',
    'NO_CONTENT_AVAILABLE',
    'ROUND_IN_PROGRESS',
    'NOT_ENOUGH_PLAYERS',
    'INVALID_MODE',
  ])('maps %s to an AppError', async (code) => {
    rpcFails(code)
    await expectAppError(startRound('room-1', 'social'), code)
  })
})

describe('revealRound', () => {
  it('calls reveal_round with the round id', async () => {
    rpcResolves(null)

    await expect(revealRound('round-1')).resolves.toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('reveal_round', { round_id: 'round-1' })
  })

  it.each<AppErrorCode>(['NOT_HOST', 'ROUND_ALREADY_REVEALED', 'ROUND_NOT_FOUND'])(
    'maps %s to an AppError',
    async (code) => {
      rpcFails(code)
      await expectAppError(revealRound('round-1'), code)
    },
  )
})

describe('submitAnswer', () => {
  it('calls submit_answer with the round id and payload', async () => {
    rpcResolves(null)

    await expect(submitAnswer('round-1', { text: 'zebra' })).resolves.toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('submit_answer', {
      round_id: 'round-1',
      payload: { text: 'zebra' },
    })
  })

  it('reuses the same call to edit an answer', async () => {
    rpcResolves(null)

    await submitAnswer('round-1', { choiceId: 'a' })
    await submitAnswer('round-1', { choiceId: 'b' })
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'submit_answer', {
      round_id: 'round-1',
      payload: { choiceId: 'b' },
    })
  })

  it.each<AppErrorCode>(['ROUND_NOT_ANSWERING', 'INVALID_ANSWER', 'SELF_VOTE_NOT_ALLOWED'])(
    'maps %s to an AppError',
    async (code) => {
      rpcFails(`${code}: detail`)
      await expectAppError(submitAnswer('round-1', { votedPlayerId: 'p2' }), code)
    },
  )
})

describe('round service failures', () => {
  it('maps a failed sign-in to an AppError without calling the RPC', async () => {
    ensureAnonymousSession.mockRejectedValue(new TypeError('Failed to fetch'))

    await expectAppError(startRound('room-1', 'trivia'), 'NETWORK_ERROR')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('maps a server error status to SERVICE_UNAVAILABLE', async () => {
    rpcFails('upstream timeout', 503, '')
    await expectAppError(revealRound('round-1'), 'SERVICE_UNAVAILABLE')
  })

  it('maps an unknown failure to UNKNOWN', async () => {
    rpcFails('something odd')
    await expectAppError(submitAnswer('round-1', { text: 'x' }), 'UNKNOWN')
  })
})
