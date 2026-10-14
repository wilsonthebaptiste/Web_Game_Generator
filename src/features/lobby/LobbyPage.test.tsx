import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import type { RoomSession } from '../../types/game'
import { LobbyPage } from './LobbyPage'

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
