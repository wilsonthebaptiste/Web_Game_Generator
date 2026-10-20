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

/** Reports a realtime status for the rounds channel, as realtime-js would. */
function channelStatus(status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') {
  const callback = mocks.channel.subscribe.mock.calls[0][0] as (s: string) => void
  act(() => callback(status))
}

function browserEvent(type: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(type))
  })
}

let visibility: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })

function tabBecomes(state: DocumentVisibilityState) {
  visibility = state
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

type HookResult = { current: ReturnType<typeof useRoomSession> }
const connectionOf = (result: HookResult) =>
  result.current.status === 'ready' ? result.current.session.connection : result.current.status

/** Renders the hook and waits until it has subscribed. */
async function connected() {
  const hook = renderHook(() => useRoomSession(ROOM_CODE))
  await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalled())
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.channel.on.mockReturnValue(mocks.channel)
  mocks.channel.subscribe.mockReturnValue(mocks.channel)
  mocks.subscribeToRoom.mockReturnValue(mocks.unsubscribeRoom)
  mocks.ensureAnonymousSession.mockResolvedValue('user-1')
  mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(lobbyGuest))
  visibility = 'visible'
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
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

describe('useRoomSession: reconnects', () => {
  it('starts connected and does not refetch on the first SUBSCRIBED', async () => {
    const { result } = await connected()
    channelStatus('SUBSCRIBED')
    await wait(REFETCH_DEBOUNCE_MS * 2)
    expect(connectionOf(result)).toBe('connected')
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(1)
  })

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'shows reconnecting and refetches on %s, then catches up when it re-subscribes',
    async (status) => {
      const { result } = await connected()
      channelStatus(status)
      expect(connectionOf(result)).toBe('reconnecting')
      await waitFor(() => expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2))

      mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(answeringSessions.trivia.notSubmitted))
      channelStatus('SUBSCRIBED')
      expect(connectionOf(result)).toBe('connected')
      await waitFor(() => expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(3))
      await waitFor(() =>
        expect(result.current.status === 'ready' && result.current.session.room.status).toBe(
          'playing',
        ),
      )
    },
  )

  it('shows offline, then refetches when the browser is back online', async () => {
    const { result } = await connected()
    browserEvent('offline')
    expect(connectionOf(result)).toBe('offline')

    browserEvent('online')
    expect(connectionOf(result)).toBe('connected')
    await waitFor(() => expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2))
  })

  it('stays reconnecting after coming online until realtime re-subscribes', async () => {
    const { result } = await connected()
    browserEvent('offline')
    channelStatus('CHANNEL_ERROR')
    expect(connectionOf(result)).toBe('offline')

    browserEvent('online')
    expect(connectionOf(result)).toBe('reconnecting')
    channelStatus('SUBSCRIBED')
    expect(connectionOf(result)).toBe('connected')
  })

  it('starts offline when the browser already is', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = await connected()
    expect(connectionOf(result)).toBe('offline')
  })

  it('refetches when the tab becomes visible, not when it is hidden', async () => {
    await connected()
    tabBecomes('hidden')
    await wait(REFETCH_DEBOUNCE_MS * 2)
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(1)

    tabBecomes('visible')
    await waitFor(() => expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2))
  })

  it('combines several reconnect signals into one refetch', async () => {
    await connected()
    browserEvent('online')
    tabBecomes('visible')
    channelStatus('CHANNEL_ERROR')
    await wait(REFETCH_DEBOUNCE_MS * 3)
    expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2)
  })

  it('ends the session if the room expired while away', async () => {
    const { result } = await connected()
    mocks.getRoomSnapshot.mockRejectedValue({ message: 'ROOM_EXPIRED' })
    tabBecomes('visible')
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.status === 'error' && result.current.error.code).toBe('ROOM_EXPIRED')
  })

  it('shows the finished game if it ended while away', async () => {
    const { result } = await connected()
    mocks.getRoomSnapshot.mockResolvedValue(snapshotOf(finishedTie))
    browserEvent('online')
    await waitFor(() =>
      expect(result.current.status === 'ready' && result.current.session.room.status).toBe(
        'finished',
      ),
    )
  })

  it('keeps the last good state if the reconnect refetch fails', async () => {
    const { result } = await connected()
    mocks.getRoomSnapshot.mockRejectedValue(new TypeError('Failed to fetch'))
    browserEvent('online')
    await waitFor(() => expect(mocks.getRoomSnapshot).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('ready')
  })

  it('stops listening on unmount', async () => {
    const { unmount } = await connected()
    unmount()
    browserEvent('online')
    tabBecomes('visible')
    channelStatus('CHANNEL_ERROR')
    await wait(REFETCH_DEBOUNCE_MS * 2)
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

  it('shows a banner while offline or reconnecting, and hides it once connected', async () => {
    renderAt(`/room/${ROOM_CODE}`)
    await screen.findByRole('heading', { name: `Lobby ${ROOM_CODE}` })
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalled())
    expect(screen.queryByText(/offline|Reconnecting/)).not.toBeInTheDocument()

    browserEvent('offline')
    expect(screen.getByText(/You’re offline\./)).toBeInTheDocument()
    browserEvent('online')
    channelStatus('CHANNEL_ERROR')
    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument()
    channelStatus('SUBSCRIBED')
    expect(screen.queryByText(/offline|Reconnecting/)).not.toBeInTheDocument()
  })

  it('offers a retry for a network failure', async () => {
    mocks.getRoomSnapshot.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderAt(`/room/${ROOM_CODE}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: `Lobby ${ROOM_CODE}` })).toBeInTheDocument()
  })
})
