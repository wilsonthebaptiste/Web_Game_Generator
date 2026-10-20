import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { createAppError } from '../lib/errors'
import {
  answeringSessions,
  finishedTie,
  lobbyGuest,
  lobbyHost,
  ROOM_CODE,
  ROOM_ID,
} from '../test/fixtures'
import type { RoomSession, RoomSnapshot } from '../types/game'
import { routes } from './routes'
import { REFETCH_DEBOUNCE_MS, useRoomSession } from './useRoomSession'

const mocks = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  return {
    channel,
    channelName: vi.fn(),
    removeChannel: vi.fn(),
    unsubscribeRoom: vi.fn(),
    getRoomSnapshot: vi.fn(),
    subscribeToRoom: vi.fn(),
    ensureAnonymousSession: vi.fn(),
  }
})

vi.mock('../services/rooms', () => ({
  getRoomSnapshot: mocks.getRoomSnapshot,
  subscribeToRoom: mocks.subscribeToRoom,
}))

vi.mock('../lib/supabaseClient', () => ({
  ensureAnonymousSession: mocks.ensureAnonymousSession,
  getSupabase: () => ({
    channel: (name: string) => {
      mocks.channelName(name)
      return mocks.channel
    },
    removeChannel: mocks.removeChannel,
  }),
}))

/** What get_room_snapshot returns: a session without the client-only fields. */
function snapshotOf(session: RoomSession): RoomSnapshot {
  const { room, players, currentRound, me, myAnswer } = session
  return { room, players, currentRound, me, myAnswer }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** The callbacks the hook registered for realtime events. */
function realtimeCallbacks() {
  const roomCallback = mocks.subscribeToRoom.mock.calls[0][1] as () => void
  const roundsCallback = mocks.channel.on.mock.calls[0][2] as () => void
  return { roomCallback, roundsCallback }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.channel.on.mockReturnValue(mocks.channel)
  mocks.channel.subscribe.mockReturnValue(mocks.channel)
  mocks.subscribeToRoom.mockReturnValue(mocks.unsubscribeRoom)
  mocks.ensureAnonymousSession.mockResolvedValue('user-1')
  mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(lobbyGuest))
})

describe('useRoomSession', () => {
  it('signs in, loads the snapshot, and builds the session', async () => {
    const { result } = renderHook(() => useRoomSession(' abcde '))
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mocks.ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(mocks.getRoomSnapshot).toHaveBeenCalledWith('ABCDE')
    if (result.current.status !== 'ready') throw new Error('not ready')
    expect(result.current.session).toMatchObject({
      room: { code: ROOM_CODE },
      me: { id: lobbyGuest.me.id },
      isHost: false,
      connection: 'connected',
    })
  })

  it('marks the host', async () => {
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(lobbyHost))
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.session.isHost).toBe(true)
  })

  it('subscribes to the room and its rounds after the first snapshot', async () => {
    renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(mocks.subscribeToRoom).toHaveBeenCalled())
    expect(mocks.subscribeToRoom).toHaveBeenCalledWith(ROOM_ID, expect.any(Function))
    expect(mocks.channelName).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^room-rounds:${ROOM_ID}:\\d+$`)),
    )
    expect(mocks.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${ROOM_ID}` },
      expect.any(Function),
    )
    expect(mocks.channel.subscribe).toHaveBeenCalled()
  })

  it('uses a new rounds channel topic for every subscription', async () => {
    // realtime-js would hand back an already-subscribed channel for a reused topic.
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(mocks.channelName).toHaveBeenCalledTimes(1))

    mocks.getRoomSnapshot.mockRejectedValueOnce({ message: 'ROOM_EXPIRED' })
    await act(async () => {
      if (result.current.status === 'ready') await result.current.session.refresh()
    })
    act(() => {
      if (result.current.status === 'error') result.current.retry()
    })
    await waitFor(() => expect(mocks.channelName).toHaveBeenCalledTimes(2))

    const [[first], [second]] = mocks.channelName.mock.calls
    expect(first).not.toBe(second)
  })

  it('refetches when the server confirms database changes are flowing', async () => {
    // Changes between SUBSCRIBED and this confirmation are never delivered.
    renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(mocks.channel.on).toHaveBeenCalledTimes(2))
    const [type, , onSystem] = mocks.channel.on.mock.calls[1] as [
      string,
      object,
      (payload: object) => void,
    ]
    expect(type).toBe('system')

    act(() => onSystem({ extension: 'presence', status: 'ok' }))
    await act(() => wait(REFETCH_DEBOUNCE_MS * 2))
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(1)

    act(() => onSystem({ extension: 'postgres_changes', status: 'ok' }))
    await act(() => wait(REFETCH_DEBOUNCE_MS * 2))
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2)
  })

  it('refetches once after a burst of realtime events', async () => {
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(mocks.subscribeToRoom).toHaveBeenCalled())
    const started = answeringSessions.trivia.notSubmitted
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(started))

    const { roomCallback, roundsCallback } = realtimeCallbacks()
    act(() => {
      roomCallback()
      roundsCallback()
      roomCallback()
    })
    await act(() => wait(REFETCH_DEBOUNCE_MS * 2))

    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2)
    expect(result.current.status === 'ready' && result.current.session.room.status).toBe('playing')
  })

  it('refresh() refetches immediately', async () => {
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(answeringSessions.trivia.submitted))

    await act(async () => {
      if (result.current.status === 'ready') await result.current.session.refresh()
    })
    expect(result.current.status === 'ready' && result.current.session.myAnswer).toEqual(
      answeringSessions.trivia.submitted.myAnswer,
    )
  })

  it('ignores a slow response that arrives after a newer one', async () => {
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const slow = deferred<RoomSnapshot>()
    const fast = deferred<RoomSnapshot>()
    mocks.getRoomSnapshot.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const session = result.current.status === 'ready' ? result.current.session : undefined

    await act(async () => {
      const first = session!.refresh()
      const second = session!.refresh()
      fast.resolve(snapshotOf(answeringSessions.social.submitted))
      slow.resolve(snapshotOf(lobbyGuest))
      await Promise.all([first, second])
    })
    expect(result.current.status === 'ready' && result.current.session.room.selectedMode).toBe(
      'social',
    )
  })

  it('keeps the last good state when a refetch fails with a network error', async () => {
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    mocks.getRoomSnapshot.mockRejectedValue(new TypeError('Failed to fetch'))

    await act(async () => {
      if (result.current.status === 'ready') await result.current.session.refresh()
    })
    expect(result.current.status).toBe('ready')
  })

  it('ends the session when a refetch says the room expired', async () => {
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    mocks.getRoomSnapshot.mockRejectedValue({ message: 'ROOM_EXPIRED' })

    await act(async () => {
      if (result.current.status === 'ready') await result.current.session.refresh()
    })
    expect(result.current.status === 'error' && result.current.error.code).toBe('ROOM_EXPIRED')
  })

  it('shows a first-load failure and recovers on retry', async () => {
    mocks.getRoomSnapshot.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.status === 'error' && result.current.error.code).toBe('NETWORK_ERROR')

    act(() => {
      if (result.current.status === 'error') result.current.retry()
    })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('reports a sign-in failure', async () => {
    mocks.ensureAnonymousSession.mockRejectedValue(createAppError('CONFIG_MISSING'))
    const { result } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.status === 'error' && result.current.error.code).toBe('CONFIG_MISSING')
    expect(mocks.getRoomSnapshot).not.toHaveBeenCalled()
  })

  it('unsubscribes and stops refetching on unmount', async () => {
    const { unmount } = renderHook(() => useRoomSession(ROOM_CODE))
    await waitFor(() => expect(mocks.subscribeToRoom).toHaveBeenCalled())
    const { roomCallback } = realtimeCallbacks()

    act(() => roomCallback())
    unmount()
    await wait(REFETCH_DEBOUNCE_MS * 2)

    expect(mocks.unsubscribeRoom).toHaveBeenCalledOnce()
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel)
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(1)
  })
})

describe('RoomPage', () => {
  function renderAt(path: string) {
    const router = createMemoryRouter(routes, { initialEntries: [path] })
    render(<RouterProvider router={router} />)
    return router
  }

  it('shows the lobby for a lobby room', async () => {
    renderAt(`/room/${ROOM_CODE}`)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the room')
    expect(await screen.findByRole('heading', { name: `Lobby ${ROOM_CODE}` })).toBeInTheDocument()
  })

  it('shows the game for a playing room', async () => {
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(answeringSessions.trivia.notSubmitted))
    renderAt(`/room/${ROOM_CODE}`)
    expect(await screen.findByText(/Round 2 of 10/)).toBeInTheDocument()
  })

  it('shows the end of the game for a finished room', async () => {
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(finishedTie))
    renderAt(`/room/${ROOM_CODE}`)
    expect(await screen.findByRole('heading', { name: 'Game over' })).toBeInTheDocument()
    expect(screen.getByText('🏆 It’s a tie!')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Final scores' })).toBeInTheDocument()
  })

  it('sends non-members to the join form with the code filled in', async () => {
    mocks.getRoomSnapshot.mockRejectedValue({ message: 'NOT_A_MEMBER' })
    const router = renderAt('/room/abcde')
    await waitFor(() => expect(router.state.location.pathname).toBe('/join/ABCDE'))
  })

  it('offers only a way home for an expired room', async () => {
    mocks.getRoomSnapshot.mockRejectedValue({ message: 'ROOM_EXPIRED' })
    renderAt(`/room/${ROOM_CODE}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('This room has expired')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home page/i })).toHaveAttribute('href', '/')
  })

  it('offers a retry for a network failure', async () => {
    mocks.getRoomSnapshot.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt(`/room/${ROOM_CODE}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: `Lobby ${ROOM_CODE}` })).toBeInTheDocument()
  })
})
