import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAppError } from '../../lib/errors'
import {
  AVA_ID,
  BEN_ID,
  CLEO_ID,
  lobbyGuest,
  lobbyHost,
  lobbyHostAlone,
  ROOM_CODE,
  viewAs,
} from '../../test/fixtures'
import type { AppErrorCode, Round, RoomSession } from '../../types/game'
import { LobbyPage } from './LobbyPage'

const { startRound } = vi.hoisted(() => ({ startRound: vi.fn() }))
vi.mock('../../services/rounds', () => ({ startRound }))

beforeEach(() => {
  startRound.mockReset()
})

const joinLink = `${window.location.origin}/join/${ROOM_CODE}`

function renderLobby(session: RoomSession) {
  const user = userEvent.setup()
  render(<LobbyPage session={session} />)
  return { user }
}

const playerList = () => screen.getByRole('list', { name: /Players/ })
const playerRow = (name: string) =>
  within(playerList())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith(name))!

describe('LobbyPage', () => {
  it('shows the room code and the join link', () => {
    renderLobby(lobbyGuest)

    expect(screen.getByRole('heading', { level: 1, name: `Lobby ${ROOM_CODE}` })).toBeVisible()
    const invite = screen.getByRole('region', { name: 'Invite players' })
    expect(within(invite).getByText(ROOM_CODE)).toHaveClass('lobby-code')
    expect(screen.getByLabelText('Join link')).toHaveValue(joinLink)
  })

  it('lists every player in join order with a count', () => {
    renderLobby(lobbyGuest)

    expect(screen.getByRole('heading', { name: 'Players (3)' })).toBeVisible()
    const names = within(playerList())
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.lobby-player__name')?.textContent)
    expect(names).toEqual(['Ava', 'Ben', 'Cleo'])
  })

  it('marks the host with text, not only an icon or color', () => {
    renderLobby(lobbyGuest)

    expect(playerRow('Ava')).toHaveTextContent('Host')
    expect(within(playerRow('Ava')).getByText('★')).toHaveAttribute('aria-hidden', 'true')
    expect(playerRow('Ben')).not.toHaveTextContent('Host')
    expect(playerRow('Cleo')).not.toHaveTextContent('Host')
  })

  it.each([
    ['the host', AVA_ID, 'Ava'],
    ['a guest', BEN_ID, 'Ben'],
    ['another guest', CLEO_ID, 'Cleo'],
  ])('marks only the viewer’s own row as "You" for %s', (_label, viewerId, name) => {
    renderLobby(viewAs(lobbyHost, viewerId))

    const rows = within(playerList()).getAllByRole('listitem')
    const marked = rows.filter((row) => within(row).queryByText('You'))
    expect(marked).toHaveLength(1)
    expect(marked[0]).toBe(playerRow(name))
  })

  it('renders names as plain text', () => {
    const players = lobbyGuest.players.map((p) =>
      p.id === CLEO_ID ? { ...p, displayName: '<b>Cleo</b>' } : p,
    )
    renderLobby({ ...lobbyGuest, players })

    expect(screen.getByText('<b>Cleo</b>')).toBeVisible()
  })

  it('shows a waiting hint when the host is alone', () => {
    renderLobby(lobbyHostAlone)

    expect(screen.getByRole('heading', { name: 'Players (1)' })).toBeVisible()
    expect(within(playerList()).getAllByRole('listitem')).toHaveLength(1)
    expect(playerRow('Ava')).toHaveTextContent('Host')
    expect(playerRow('Ava')).toHaveTextContent('You')
    expect(screen.getByText(/Waiting for others to join/)).toBeVisible()
  })

  it('handles an empty player list', () => {
    renderLobby({ ...lobbyHost, players: [] })

    expect(screen.getByRole('heading', { name: 'Players (0)' })).toBeVisible()
    expect(screen.getByText('No one has joined yet.')).toBeVisible()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('drops the waiting hint once a second player joins', () => {
    renderLobby(lobbyHost)

    expect(screen.queryByText(/Waiting for others to join/)).not.toBeInTheDocument()
  })
})

describe('host vs non-host', () => {
  it('shows the host the mode picker and no waiting message', () => {
    renderLobby(lobbyHost)

    const picker = screen.getByRole('group', { name: 'Choose a game mode' })
    expect(within(picker).getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByText('Waiting for host to start…')).not.toBeInTheDocument()
  })

  it('lets the host pick a mode', async () => {
    const { user } = renderLobby(lobbyHost)

    await user.click(screen.getByRole('radio', { name: 'Word guessing' }))

    expect(screen.getByRole('radio', { name: 'Word guessing' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Trivia' })).not.toBeChecked()
  })

  it('starts the picker on the room’s selected mode, if any', () => {
    renderLobby({ ...lobbyHost, room: { ...lobbyHost.room, selectedMode: 'social' } })

    expect(screen.getByRole('radio', { name: 'Social' })).toBeChecked()
  })

  it.each([
    ['Ben', BEN_ID],
    ['Cleo', CLEO_ID],
  ])('shows %s (non-host) a waiting message and no host controls', (_name, viewerId) => {
    renderLobby(viewAs(lobbyHost, viewerId))

    expect(screen.getByText('Waiting for host to start…')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Choose a game mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Host controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument()
  })
})

describe('start game', () => {
  const startButton = () => screen.getByRole('button', { name: /Start game|Starting game/ })
  const withMode = (session: RoomSession): RoomSession => ({
    ...session,
    room: { ...session.room, selectedMode: 'trivia' },
  })
  const withRefresh = (session: RoomSession) => ({ ...session, refresh: vi.fn(async () => {}) })

  it('is disabled for a lone host, with the reason as text', () => {
    renderLobby(withMode(lobbyHostAlone))

    expect(startButton()).toBeDisabled()
    expect(startButton()).toHaveAccessibleDescription('You need at least 2 players to start.')
    expect(screen.getByText('You need at least 2 players to start.')).toBeVisible()
  })

  it('is disabled until the host picks a mode, with the reason as text', async () => {
    const { user } = renderLobby(lobbyHost)

    expect(startButton()).toBeDisabled()
    expect(startButton()).toHaveAccessibleDescription('Choose a game mode to start.')

    await user.click(screen.getByRole('radio', { name: 'Trivia' }))

    expect(startButton()).toBeEnabled()
    expect(startButton()).not.toHaveAccessibleDescription()
  })

  it('starts a round with the selected mode, then refreshes the session', async () => {
    startRound.mockResolvedValue({ id: 'round-1' } as Round)
    const session = withRefresh(lobbyHost)
    const { user } = renderLobby(session)

    await user.click(screen.getByRole('radio', { name: 'Word guessing' }))
    await user.click(startButton())

    expect(startRound).toHaveBeenCalledOnce()
    expect(startRound).toHaveBeenCalledWith(lobbyHost.room.id, 'word-guessing')
    expect(session.refresh).toHaveBeenCalledOnce()
    expect(startRound.mock.invocationCallOrder[0]).toBeLessThan(
      session.refresh.mock.invocationCallOrder[0],
    )
  })

  it('uses the room’s selected mode when the host does not change it', async () => {
    startRound.mockResolvedValue({ id: 'round-1' } as Round)
    const { user } = renderLobby(withRefresh(withMode(lobbyHost)))

    await user.click(startButton())

    expect(startRound).toHaveBeenCalledWith(lobbyHost.room.id, 'trivia')
  })

  it('ignores a double click while the request is in flight', async () => {
    startRound.mockReturnValue(new Promise(() => {}))
    const { user } = renderLobby(withRefresh(withMode(lobbyHost)))

    await user.dblClick(startButton())

    expect(startRound).toHaveBeenCalledOnce()
    expect(startButton()).toBeDisabled()
    expect(startButton()).toHaveTextContent('Starting game…')
    within(screen.getByRole('group', { name: 'Choose a game mode' }))
      .getAllByRole('radio')
      .forEach((radio) => expect(radio).toBeDisabled())
  })

  it('stays disabled after a successful start until the game view takes over', async () => {
    startRound.mockResolvedValue({ id: 'round-1' } as Round)
    const { user } = renderLobby(withRefresh(withMode(lobbyHost)))

    await user.click(startButton())
    await user.click(startButton())

    expect(startRound).toHaveBeenCalledOnce()
    expect(startButton()).toBeDisabled()
  })

  it.each<[AppErrorCode, RegExp]>([
    ['NOT_ENOUGH_PLAYERS', /at least 2 players/],
    ['NOT_HOST', /Only the host/],
    ['INVALID_MODE', /game mode isn't available/],
  ])('shows a friendly message for %s and lets the host retry', async (code, message) => {
    startRound.mockRejectedValueOnce(createAppError(code))
    const session = withRefresh(withMode(lobbyHost))
    const { user } = renderLobby(session)

    await user.click(startButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t start the game')
    expect(alert).toHaveTextContent(message)
    expect(session.refresh).not.toHaveBeenCalled()
    expect(startButton()).toBeEnabled()

    startRound.mockResolvedValueOnce({ id: 'round-1' } as Round)
    await user.click(startButton())

    expect(startRound).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('is disabled while offline, with the reason as text', () => {
    renderLobby({ ...withMode(lobbyHost), connection: 'offline' })

    expect(startButton()).toBeDisabled()
    expect(startButton()).toHaveAccessibleDescription(
      'You’re offline. Reconnect to start the game.',
    )
  })

  it('stays enabled while realtime is only reconnecting, since the RPC uses HTTP', () => {
    renderLobby({ ...withMode(lobbyHost), connection: 'reconnecting' })

    expect(startButton()).toBeEnabled()
  })

  it('re-enables once the browser is back online', () => {
    const offline = { ...withMode(lobbyHost), connection: 'offline' as const }
    const { rerender } = render(<LobbyPage session={offline} />)
    expect(startButton()).toBeDisabled()

    rerender(<LobbyPage session={{ ...offline, connection: 'connected' }} />)

    expect(startButton()).toBeEnabled()
  })

  it.each<[AppErrorCode, RegExp]>([
    ['ROOM_EXPIRED', /This room has expired/],
    ['ROOM_FINISHED', /This game has ended/],
    ['ROUND_IN_PROGRESS', /Reveal the current round/],
  ])('refreshes the room after %s, so the page can catch up', async (code, message) => {
    startRound.mockRejectedValueOnce(createAppError(code))
    const session = withRefresh(withMode(lobbyHost))
    const { user } = renderLobby(session)

    await user.click(startButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(session.refresh).toHaveBeenCalledOnce()
  })

  it('does not refresh after a network error, which a refetch would only repeat', async () => {
    startRound.mockRejectedValueOnce(createAppError('NETWORK_ERROR'))
    const session = withRefresh(withMode(lobbyHost))
    const { user } = renderLobby(session)

    await user.click(startButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/offline or the connection dropped/)
    expect(session.refresh).not.toHaveBeenCalled()
    expect(startButton()).toBeEnabled()
  })

  it('never shows a raw error message', async () => {
    startRound.mockRejectedValueOnce(new Error('relation "rounds" does not exist'))
    const { user } = renderLobby(withRefresh(withMode(lobbyHost)))

    await user.click(startButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent(/relation|rounds/)
  })
})

describe('copy join link', () => {
  it('copies the join link and confirms it', async () => {
    const { user } = renderLobby(lobbyGuest)

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    await expect(navigator.clipboard.readText()).resolves.toBe(joinLink)
    expect(await screen.findByText(/Link copied/)).toBeVisible()
  })

  it('explains how to copy by hand when the clipboard is refused', async () => {
    const { user } = renderLobby(lobbyGuest)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(await screen.findByText(/Couldn’t copy automatically/)).toBeVisible()
  })

  it('clears the confirmation after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<LobbyPage session={lobbyGuest} />)

      await user.click(screen.getByRole('button', { name: 'Copy link' }))
      expect(await screen.findByText(/Link copied/)).toBeVisible()

      await act(() => vi.advanceTimersByTimeAsync(4000))
      expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('selects the whole link when the field is focused, for manual copying', async () => {
    const { user } = renderLobby(lobbyGuest)
    const input = screen.getByLabelText<HTMLInputElement>('Join link')

    await user.click(input)

    expect(input).toHaveAttribute('readonly')
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, joinLink.length])
  })
})
