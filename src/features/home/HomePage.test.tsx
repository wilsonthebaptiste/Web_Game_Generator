import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom'
import { createAppError } from '../../lib/errors'
import { lobbyGuest, lobbyHost } from '../../test/fixtures'
import type { AppErrorCode, RoomMembership } from '../../types/game'
import { HomePage } from './HomePage'

const { createRoom, joinRoom } = vi.hoisted(() => ({ createRoom: vi.fn(), joinRoom: vi.fn() }))
vi.mock('../../services/rooms', () => ({ createRoom }))
vi.mock('../../services/players', () => ({ joinRoom }))

const hostMembership: RoomMembership = { room: lobbyHost.room, player: lobbyHost.me }
const guestMembership: RoomMembership = { room: lobbyGuest.room, player: lobbyGuest.me }
const ROOM = lobbyHost.room.code

function RoomStub() {
  const { code } = useParams()
  return <h1>Room page {code}</h1>
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/join/:code', element: <HomePage /> },
      { path: '/room/:code', element: <RoomStub /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

const createForm = () => screen.getByRole('form', { name: 'Create a room' })
const joinForm = () => screen.getByRole('form', { name: 'Join a room' })

/** A promise the test resolves or rejects by hand, to observe the in-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HomePage', () => {
  it('shows the product name and both forms, create first', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Party Game Generator' })).toBeVisible()
    const forms = screen.getAllByRole('form')
    expect(forms).toHaveLength(2)
    expect(within(forms[0]).getByRole('button', { name: 'Create room' })).toBeVisible()
    expect(within(forms[1]).getByRole('button', { name: 'Join room' })).toBeVisible()
  })

  it('labels every input', () => {
    renderAt('/')

    expect(within(createForm()).getByLabelText('Your name')).toBeVisible()
    expect(within(joinForm()).getByLabelText('Room code')).toBeVisible()
    expect(within(joinForm()).getByLabelText('Your name')).toBeVisible()
  })
})

describe('Create room form', () => {
  it.each([
    ['empty', '', 'Enter a display name.'],
    ['whitespace-only', '   ', 'Enter a display name.'],
    ['too long', 'x'.repeat(21), 'Display name must be 20 characters or fewer.'],
  ])('blocks an %s name with a message', async (_label, name, message) => {
    const { user } = renderAt('/')

    if (name) await user.type(within(createForm()).getByLabelText('Your name'), name)
    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    expect(within(createForm()).getByRole('alert')).toHaveTextContent(message)
    expect(within(createForm()).getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true')
    expect(createRoom).not.toHaveBeenCalled()
  })

  it('clears the name error once the user types', async () => {
    const { user } = renderAt('/')
    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))
    expect(within(createForm()).getByRole('alert')).toBeVisible()

    await user.type(within(createForm()).getByLabelText('Your name'), 'A')
    expect(within(createForm()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates the room with the trimmed name and goes to the room', async () => {
    createRoom.mockResolvedValue(hostMembership)
    const { user, router } = renderAt('/')

    await user.type(within(createForm()).getByLabelText('Your name'), '  Ava  ')
    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    expect(createRoom).toHaveBeenCalledWith({ displayName: 'Ava' })
    expect(await screen.findByRole('heading', { name: `Room page ${ROOM}` })).toBeVisible()
    expect(router.state.location.pathname).toBe(`/room/${ROOM}`)
  })

  it('submits with the Enter key', async () => {
    createRoom.mockResolvedValue(hostMembership)
    const { user } = renderAt('/')

    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava{Enter}')

    expect(createRoom).toHaveBeenCalledOnce()
  })

  it('disables the button while creating, so a double click creates one room', async () => {
    const request = deferred<RoomMembership>()
    createRoom.mockReturnValue(request.promise)
    const { user } = renderAt('/')
    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava')

    const button = within(createForm()).getByRole('button', { name: 'Create room' })
    await user.dblClick(button)
    await user.keyboard('{Enter}')

    expect(createRoom).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Creating room…')

    await act(async () => request.resolve(hostMembership))
    expect(await screen.findByRole('heading', { name: `Room page ${ROOM}` })).toBeVisible()
  })

  it.each<[AppErrorCode, string]>([
    ['RATE_LIMITED', 'Too many attempts. Wait a minute and try again.'],
    ['NETWORK_ERROR', "You're offline or the connection dropped."],
    ['CODE_GENERATION_FAILED', "We couldn't create a room right now."],
  ])('shows a friendly message for %s and allows a retry', async (code, message) => {
    createRoom.mockRejectedValueOnce(createAppError(code)).mockResolvedValueOnce(hostMembership)
    const { user } = renderAt('/')
    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava')
    const button = within(createForm()).getByRole('button', { name: 'Create room' })

    await user.click(button)

    const alert = await within(createForm()).findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t create the room')
    expect(alert).toHaveTextContent(message)
    expect(button).toBeEnabled()

    await user.click(button)
    expect(createRoom).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: `Room page ${ROOM}` })).toBeVisible()
  })

  it('shows a server name error next to the name field', async () => {
    createRoom.mockRejectedValue(createAppError('NAME_INVALID'))
    const { user } = renderAt('/')
    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava')

    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    expect(await within(createForm()).findByRole('alert')).toHaveTextContent(
      'Names must be 1–20 characters',
    )
    expect(within(createForm()).getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('never shows a raw error message', async () => {
    createRoom.mockRejectedValue(new Error('relation "public.rooms" does not exist'))
    const { user } = renderAt('/')
    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava')

    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    const alert = await within(createForm()).findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('relation')
  })
})

describe('Join room form', () => {
  it.each([
    ['empty', '', 'Enter a room code.'],
    ['too short', 'ABC', 'Room codes are 5 characters.'],
    ['ambiguous characters', 'ABCD0', 'That isn’t a valid room code.'],
  ])('blocks an %s code with a message', async (_label, code, message) => {
    const { user } = renderAt('/')

    if (code) await user.type(within(joinForm()).getByLabelText('Room code'), code)
    await user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')
    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(within(joinForm()).getByRole('alert')).toHaveTextContent(message)
    expect(within(joinForm()).getByLabelText('Room code')).toHaveAttribute('aria-invalid', 'true')
    expect(joinRoom).not.toHaveBeenCalled()
  })

  it('shows errors for both fields at once', async () => {
    const { user } = renderAt('/')

    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    const alerts = within(joinForm()).getAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Enter a room code.',
      'Enter a display name.',
    ])
    expect(joinRoom).not.toHaveBeenCalled()
  })

  it('uppercases the code as it is typed', async () => {
    const { user } = renderAt('/')

    await user.type(within(joinForm()).getByLabelText('Room code'), 'abcde')

    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('ABCDE')
  })

  it('joins with the normalized code and trimmed name and goes to the room', async () => {
    joinRoom.mockResolvedValue(guestMembership)
    const { user, router } = renderAt('/')

    await user.type(within(joinForm()).getByLabelText('Room code'), ' ab-cd e ')
    await user.type(within(joinForm()).getByLabelText('Your name'), ' Ben ')
    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(joinRoom).toHaveBeenCalledWith({ roomCode: 'ABCDE', displayName: 'Ben' })
    expect(await screen.findByRole('heading', { name: `Room page ${ROOM}` })).toBeVisible()
    expect(router.state.location.pathname).toBe(`/room/${ROOM}`)
  })

  it('disables the button while joining, so a double click joins once', async () => {
    const request = deferred<RoomMembership>()
    joinRoom.mockReturnValue(request.promise)
    const { user } = renderAt('/join/ABCDE')
    await user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')

    const button = within(joinForm()).getByRole('button', { name: 'Join room' })
    await user.dblClick(button)

    expect(joinRoom).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Joining room…')

    await act(async () => request.reject(createAppError('NETWORK_ERROR')))
    expect(button).toBeEnabled()
  })

  it.each<[AppErrorCode, 'Room code' | 'Your name', string]>([
    ['ROOM_NOT_FOUND', 'Room code', "We couldn't find a room with that code."],
    ['INVALID_ROOM_CODE', 'Room code', "That doesn't look like a room code."],
    ['NAME_TAKEN', 'Your name', 'Someone in this room already has that name.'],
    ['NAME_INVALID', 'Your name', 'Names must be 1–20 characters'],
  ])('shows %s next to the %s field', async (code, field, message) => {
    joinRoom.mockRejectedValue(createAppError(code))
    const { user } = renderAt('/join/ABCDE')
    await user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')

    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(await within(joinForm()).findByRole('alert')).toHaveTextContent(message)
    expect(within(joinForm()).getByLabelText(field)).toHaveAttribute('aria-invalid', 'true')
    expect(within(joinForm()).getByLabelText(field)).toHaveFocus()
  })

  it.each<[AppErrorCode, string]>([
    ['RATE_LIMITED', 'Too many attempts.'],
    ['NETWORK_ERROR', "You're offline or the connection dropped."],
    ['SERVICE_UNAVAILABLE', 'The game server is busy or unavailable.'],
  ])('shows %s as a form error and allows a retry', async (code, message) => {
    joinRoom.mockRejectedValueOnce(createAppError(code)).mockResolvedValueOnce(guestMembership)
    const { user } = renderAt('/join/ABCDE')
    await user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')
    const button = within(joinForm()).getByRole('button', { name: 'Join room' })

    await user.click(button)

    const alert = await within(joinForm()).findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t join the room')
    expect(alert).toHaveTextContent(message)
    expect(button).toBeEnabled()

    await user.click(button)
    expect(await screen.findByRole('heading', { name: `Room page ${ROOM}` })).toBeVisible()
  })
})

describe('Rooms that can’t be joined', () => {
  const notice = () => screen.getByRole('group', { name: /has ended|has expired|already started/ })

  async function joinAndFail(code: AppErrorCode, path = '/join/ABCDE') {
    joinRoom.mockRejectedValue(createAppError(code))
    const result = renderAt(path)
    if (path === '/') {
      await result.user.type(screen.getByLabelText('Room code'), 'ABCDE')
    }
    await result.user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')
    await result.user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))
    return result
  }

  it.each<[AppErrorCode, string, RegExp]>([
    ['ROOM_FINISHED', 'This game has ended', /can’t join a finished game/],
    ['ROOM_EXPIRED', 'This room has expired', /no longer open/],
    ['ROOM_NOT_JOINABLE', 'This game has already started', /can’t join a game in progress/],
  ])('replaces the join form for %s with an explanation', async (code, title, text) => {
    await joinAndFail(code)

    const group = await screen.findByRole('group', { name: title })
    expect(group).toHaveAccessibleDescription(text)
    expect(within(group).getByRole('heading', { name: title })).toBeVisible()
    // The form is gone, so the player can't keep retrying a code that can't work.
    expect(screen.queryByRole('form', { name: 'Join a room' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join room' })).not.toBeInTheDocument()
    // The create form is still there for starting a new game.
    expect(createForm()).toBeVisible()
  })

  it('shows "This game has ended" and a link home for a finished room opened from a link', async () => {
    const { router, user } = await joinAndFail('ROOM_FINISHED')

    expect(await screen.findByRole('heading', { name: 'This game has ended' })).toBeVisible()
    const home = screen.getByRole('link', { name: 'Go to the home page' })
    expect(home).toHaveAttribute('href', '/')

    await user.click(home)

    expect(router.state.location.pathname).toBe('/')
    expect(joinForm()).toBeVisible()
    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('')
  })

  it('moves focus to the explanation, since the focused button is gone', async () => {
    await joinAndFail('ROOM_FINISHED')

    expect(await screen.findByRole('group', { name: 'This game has ended' })).toHaveFocus()
  })

  it('starts over with an empty, focused code field on the plain home page', async () => {
    const { user } = await joinAndFail('ROOM_EXPIRED', '/')
    await screen.findByRole('group', { name: 'This room has expired' })

    await user.click(screen.getByRole('link', { name: 'Go to the home page' }))

    expect(screen.queryByRole('group', { name: 'This room has expired' })).not.toBeInTheDocument()
    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('')
    expect(within(joinForm()).getByLabelText('Room code')).toHaveFocus()
  })

  it('is reachable from the keyboard', async () => {
    const { user } = await joinAndFail('ROOM_FINISHED')
    await screen.findByRole('group', { name: 'This game has ended' })

    await user.tab()

    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveFocus()
    expect(notice()).toBeVisible()
  })
})

describe('focus after a validation error', () => {
  it('moves focus to the name field when the create form is blocked', async () => {
    const { user } = renderAt('/')

    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    expect(within(createForm()).getByLabelText('Your name')).toHaveFocus()
  })

  it('moves focus to the code field first when both join fields are wrong', async () => {
    const { user } = renderAt('/')

    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(within(joinForm()).getByLabelText('Room code')).toHaveFocus()
  })

  it('moves focus to the name field when only the name is wrong', async () => {
    const { user } = renderAt('/join/ABCDE')

    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(within(joinForm()).getByLabelText('Your name')).toHaveFocus()
  })

  it('moves focus to the name field for a server name error on create', async () => {
    createRoom.mockRejectedValue(createAppError('NAME_INVALID'))
    const { user } = renderAt('/')
    await user.type(within(createForm()).getByLabelText('Your name'), 'Ava')
    await user.click(within(createForm()).getByRole('button', { name: 'Create room' }))

    await within(createForm()).findByRole('alert')
    expect(within(createForm()).getByLabelText('Your name')).toHaveFocus()
  })
})

describe('offline notice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const goOffline = () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
  }
  const goOnline = () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
  }
  const offlineText = /You’re offline\. Creating or joining a room needs a connection\./

  it('says nothing while online', () => {
    renderAt('/')

    expect(screen.queryByText(offlineText)).not.toBeInTheDocument()
  })

  it('appears when the network drops and goes when it returns', () => {
    renderAt('/')

    act(goOffline)
    expect(screen.getByRole('status')).toHaveTextContent(offlineText)

    act(goOnline)
    expect(screen.queryByText(offlineText)).not.toBeInTheDocument()
  })

  it('shows on first load when already offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderAt('/')

    expect(screen.getByText(offlineText)).toBeVisible()
  })

  it('keeps the forms usable, so a player can try once the network is back', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderAt('/')

    expect(within(createForm()).getByRole('button', { name: 'Create room' })).toBeEnabled()
    expect(within(joinForm()).getByRole('button', { name: 'Join room' })).toBeEnabled()
  })
})

describe('/join/:code prefill', () => {
  it('prefills the normalized code, shows it, and puts the join form first', () => {
    renderAt('/join/abc-de')

    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('ABCDE')
    expect(screen.getByText('ABCDE')).toBeVisible()
    const forms = screen.getAllByRole('form')
    expect(forms[0]).toBe(joinForm())
  })

  it('focuses the name field, since the code is already filled in', () => {
    renderAt('/join/ABCDE')

    expect(within(joinForm()).getByLabelText('Your name')).toHaveFocus()
  })

  it('joins with just a name', async () => {
    joinRoom.mockResolvedValue(guestMembership)
    const { user } = renderAt('/join/ABCDE')

    await user.keyboard('Ben{Enter}')

    expect(joinRoom).toHaveBeenCalledWith({ roomCode: 'ABCDE', displayName: 'Ben' })
  })

  it('still validates a bad code from the link', async () => {
    const { user } = renderAt('/join/OOPS')
    await user.type(within(joinForm()).getByLabelText('Your name'), 'Ben')

    await user.click(within(joinForm()).getByRole('button', { name: 'Join room' }))

    expect(within(joinForm()).getByRole('alert')).toHaveTextContent('Room codes are 5 characters.')
    expect(joinRoom).not.toHaveBeenCalled()
  })

  it('updates the code when the link changes', async () => {
    const { router } = renderAt('/join/ABCDE')

    await act(() => router.navigate('/join/HJK23'))

    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('HJK23')
  })

  it('leaves the code empty and does not steal focus on the plain home page', () => {
    renderAt('/')

    expect(within(joinForm()).getByLabelText('Room code')).toHaveValue('')
    expect(document.body).toHaveFocus()
  })
})
