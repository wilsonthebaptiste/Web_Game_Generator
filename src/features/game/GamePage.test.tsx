import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAppError } from '../../lib/errors'
import { submitAnswer } from '../../services/answers'
import { endGame } from '../../services/rooms'
import { revealRound, startRound } from '../../services/rounds'
import {
  answeringSessions,
  AVA_ID,
  benAnswers,
  revealedSessions,
  ROOM_ID,
  viewAs,
} from '../../test/fixtures'
import { GAME_MODES, type GameMode, type RoomSession } from '../../types/game'
import { GamePage } from './GamePage'

vi.mock('../../services/answers', () => ({ submitAnswer: vi.fn() }))
vi.mock('../../services/rounds', () => ({ startRound: vi.fn(), revealRound: vi.fn() }))
vi.mock('../../services/rooms', () => ({ endGame: vi.fn() }))

const mocked = {
  submitAnswer: vi.mocked(submitAnswer),
  startRound: vi.mocked(startRound),
  revealRound: vi.mocked(revealRound),
  endGame: vi.mocked(endGame),
}

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset()
})

/** A session with a spy `refresh`. */
function withRefresh(base: RoomSession) {
  const refresh = vi.fn(async () => {})
  return { session: { ...base, refresh }, refresh }
}

/** A promise the test resolves by hand, to hold a request in flight. */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const hostAnswering = (mode: GameMode) => viewAs(answeringSessions[mode].notSubmitted, AVA_ID)
const hostRevealed = (mode: GameMode) => viewAs(revealedSessions[mode], AVA_ID)

function lastRound(base: RoomSession): RoomSession {
  return { ...base, currentRound: { ...base.currentRound!, roundNumber: base.room.roundLimit } }
}

describe('GamePage: switches on the round status', () => {
  it.each(GAME_MODES)('%s shows the round while answering', (mode) => {
    render(<GamePage session={answeringSessions[mode].notSubmitted} />)
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument()
  })

  it.each(GAME_MODES)('%s shows the results once revealed', (mode) => {
    render(<GamePage session={revealedSessions[mode]} />)
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /answer/i })).not.toBeInTheDocument()
  })

  it.each(GAME_MODES)('%s shows the leaderboard with this round’s points on results', (mode) => {
    render(<GamePage session={revealedSessions[mode]} />)
    const board = screen.getByRole('region', { name: 'Leaderboard' })
    expect(within(board).getByRole('columnheader', { name: 'This round' })).toBeInTheDocument()
    expect(within(board).getByText(/\(you\)/)).toBeInTheDocument()
  })

  it('shows no leaderboard while answering', () => {
    render(<GamePage session={answeringSessions.trivia.submitted} />)
    expect(screen.queryByRole('region', { name: 'Leaderboard' })).not.toBeInTheDocument()
  })

  it('waits for the host when there is no round yet', () => {
    render(<GamePage session={{ ...answeringSessions.trivia.notSubmitted, currentRound: null }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the host to start the round')
  })
})

describe('GamePage: host vs non-host controls', () => {
  it.each(GAME_MODES)('%s: a non-host never sees host controls while answering', (mode) => {
    render(<GamePage session={answeringSessions[mode].notSubmitted} />)
    expect(screen.queryByRole('region', { name: 'Host controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lock & reveal' })).not.toBeInTheDocument()
  })

  it.each(GAME_MODES)('%s: a non-host never sees host controls on results', (mode) => {
    render(<GamePage session={revealedSessions[mode]} />)
    expect(screen.queryByRole('region', { name: 'Host controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next round' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End game' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText(/Waiting for the host to start the next round/)).toBeInTheDocument()
  })

  it('tells a non-host when the last round is done', () => {
    render(<GamePage session={lastRound(revealedSessions.trivia)} />)
    expect(screen.getByText(/last round/i)).toBeInTheDocument()
  })

  it.each(GAME_MODES)('%s: the host sees Lock & reveal while answering', (mode) => {
    render(<GamePage session={hostAnswering(mode)} />)
    expect(screen.getByRole('button', { name: 'Lock & reveal' })).toBeEnabled()
  })

  it.each(GAME_MODES)('%s: the host sees the mode picker, Next round and End game', (mode) => {
    render(<GamePage session={hostRevealed(mode)} />)
    expect(screen.getByRole('radio', { checked: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next round' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'End game' })).toBeEnabled()
  })

  it('hides Next round on the last round but keeps End game', () => {
    render(<GamePage session={lastRound(hostRevealed('social'))} />)
    expect(screen.queryByRole('button', { name: 'Next round' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End game' })).toBeEnabled()
  })
})

describe('GamePage: Lock & reveal', () => {
  it('fires reveal_round once on a double click and refreshes after', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(hostAnswering('trivia'))
    const request = deferred()
    mocked.revealRound.mockReturnValue(request.promise)
    render(<GamePage session={session} />)

    await user.dblClick(screen.getByRole('button', { name: 'Lock & reveal' }))
    expect(mocked.revealRound).toHaveBeenCalledOnce()
    expect(mocked.revealRound).toHaveBeenCalledWith(session.currentRound!.id)
    expect(screen.getByRole('button', { name: 'Revealing…' })).toBeDisabled()

    await act(async () => request.resolve())
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('shows the error and allows a retry when the reveal fails', async () => {
    const user = userEvent.setup()
    mocked.revealRound.mockRejectedValueOnce(createAppError('ROUND_ALREADY_REVEALED'))
    render(<GamePage session={hostAnswering('word-guessing')} />)

    await user.click(screen.getByRole('button', { name: 'Lock & reveal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This round has already been revealed.',
    )
    expect(screen.getByRole('button', { name: 'Lock & reveal' })).toBeEnabled()
  })
})

describe('GamePage: next round and end game', () => {
  it('starts the next round once with the chosen mode', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(hostRevealed('trivia'))
    const request = deferred()
    mocked.startRound.mockReturnValue(request.promise.then(() => session.currentRound!))
    render(<GamePage session={session} />)

    await user.click(screen.getByRole('radio', { name: /Word guessing/i }))
    await user.dblClick(screen.getByRole('button', { name: 'Next round' }))
    expect(mocked.startRound).toHaveBeenCalledOnce()
    expect(mocked.startRound).toHaveBeenCalledWith(ROOM_ID, 'word-guessing')
    expect(screen.getByRole('button', { name: 'End game' })).toBeDisabled()

    await act(async () => request.resolve())
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('ends the game with endGame', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(hostRevealed('social'))
    mocked.endGame.mockResolvedValue()
    render(<GamePage session={session} />)

    await user.dblClick(screen.getByRole('button', { name: 'End game' }))
    expect(mocked.endGame).toHaveBeenCalledOnce()
    expect(mocked.endGame).toHaveBeenCalledWith(ROOM_ID)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('shows a friendly error when the round limit is reached', async () => {
    const user = userEvent.setup()
    mocked.startRound.mockRejectedValueOnce(createAppError('ROUND_LIMIT_REACHED'))
    render(<GamePage session={hostRevealed('trivia')} />)

    await user.click(screen.getByRole('button', { name: 'Next round' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You’ve played all the rounds for this game.',
    )
    expect(screen.getByRole('button', { name: 'Next round' })).toBeEnabled()
  })
})

describe('GamePage: submitting answers', () => {
  it('sends an answer only once on a double click', async () => {
    const user = userEvent.setup()
    const request = deferred()
    mocked.submitAnswer.mockReturnValue(request.promise)
    render(<GamePage session={answeringSessions['word-guessing'].notSubmitted} />)

    await user.type(screen.getByRole('textbox'), 'zebra')
    await user.dblClick(screen.getByRole('button', { name: 'Submit answer' }))
    expect(mocked.submitAnswer).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()

    await act(async () => request.resolve())
    expect(screen.getByRole('button', { name: /answer/i })).toBeEnabled()
  })

  it('validates before sending', async () => {
    const user = userEvent.setup()
    render(<GamePage session={answeringSessions['word-guessing'].notSubmitted} />)

    await user.type(screen.getByRole('textbox'), '   ')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(mocked.submitAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('edits an answer, then shows the lock and the results after the host reveals', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(answeringSessions['word-guessing'].submitted)
    mocked.submitAnswer.mockResolvedValueOnce()
    const { rerender } = render(<GamePage session={session} />)

    // Edit: the same call replaces the answer.
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue((benAnswers['word-guessing'] as { text: string }).text)
    await user.clear(input)
    await user.type(input, 'horse')
    await user.click(screen.getByRole('button', { name: 'Update answer' }))
    expect(mocked.submitAnswer).toHaveBeenLastCalledWith(session.currentRound!.id, {
      text: 'horse',
    })
    expect(refresh).toHaveBeenCalledOnce()

    // The host locks the round before a second edit reaches the server.
    mocked.submitAnswer.mockRejectedValueOnce(createAppError('ROUND_NOT_ANSWERING'))
    await user.type(input, 's')
    await user.click(screen.getByRole('button', { name: 'Update answer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Answers are locked for this round.')

    // The session catches up and the results replace the round.
    rerender(<GamePage session={revealedSessions['word-guessing']} />)
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('GamePage: coverage gaps', () => {
  it('preselects the mode the room last used for the next round', () => {
    render(<GamePage session={hostRevealed('word-guessing')} />)
    expect(screen.getByRole('radio', { name: /Word guessing/i })).toBeChecked()
  })

  it('locks the mode picker while the next round is starting', async () => {
    const user = userEvent.setup()
    mocked.startRound.mockReturnValue(new Promise(() => {}))
    render(<GamePage session={hostRevealed('trivia')} />)

    await user.click(screen.getByRole('button', { name: 'Next round' }))
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Starting round…' })).toBeDisabled()
  })

  it('clears a host error when the host retries', async () => {
    const user = userEvent.setup()
    mocked.revealRound.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mocked.revealRound.mockReturnValueOnce(new Promise(() => {}))
    render(<GamePage session={hostAnswering('social')} />)

    await user.click(screen.getByRole('button', { name: 'Lock & reveal' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lock & reveal' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocked.revealRound).toHaveBeenCalledTimes(2)
  })

  it('shows the host the answer form as well as the reveal button', () => {
    render(<GamePage session={hostAnswering('trivia')} />)
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock & reveal' })).toBeInTheDocument()
  })
})
