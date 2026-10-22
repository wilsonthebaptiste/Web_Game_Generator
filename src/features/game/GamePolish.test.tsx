import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAppError } from '../../lib/errors'
import { submitAnswer } from '../../services/answers'
import { answeringSessions, prompts, revealedSessions } from '../../test/fixtures'
import { GAME_MODES, type RoomSession } from '../../types/game'
import { GamePage } from './GamePage'

vi.mock('../../services/answers', () => ({ submitAnswer: vi.fn() }))
vi.mock('../../services/rounds', () => ({ startRound: vi.fn(), revealRound: vi.fn() }))
vi.mock('../../services/rooms', () => ({ endGame: vi.fn() }))

const mockedSubmitAnswer = vi.mocked(submitAnswer)

beforeEach(() => {
  mockedSubmitAnswer.mockReset()
})

function withRefresh(base: RoomSession) {
  const refresh = vi.fn(async () => {})
  return { session: { ...base, refresh }, refresh }
}

function nextRound(base: RoomSession): RoomSession {
  return {
    ...base,
    myAnswer: null,
    currentRound: { ...base.currentRound!, id: 'round-next', roundNumber: 3 },
  }
}

describe('focus management', () => {
  it.each(GAME_MODES)('%s moves focus to the prompt when the round starts', (mode) => {
    render(<GamePage session={answeringSessions[mode].notSubmitted} />)
    expect(screen.getByRole('heading', { level: 1, name: prompts[mode].prompt })).toHaveFocus()
  })

  it('moves focus to the new prompt when the next round starts', () => {
    const { rerender } = render(<GamePage session={revealedSessions.trivia} />)
    rerender(<GamePage session={nextRound(answeringSessions.trivia.notSubmitted)} />)
    expect(screen.getByRole('heading', { level: 1, name: prompts.trivia.prompt })).toHaveFocus()
  })

  it.each(GAME_MODES)('%s moves focus to the results heading on reveal', (mode) => {
    const { rerender } = render(<GamePage session={answeringSessions[mode].submitted} />)
    rerender(<GamePage session={revealedSessions[mode]} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toHaveFocus()
  })
})

describe('the round changes under you', () => {
  it('says so when the host reveals while you are typing an unsent answer', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <GamePage session={answeringSessions['word-guessing'].notSubmitted} />,
    )
    await user.type(screen.getByRole('textbox'), 'penguin')

    rerender(<GamePage session={{ ...revealedSessions['word-guessing'], myAnswer: null }} />)
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(
      screen.getByText('The host revealed the round before your answer was sent.'),
    ).toBeInTheDocument()
  })

  it('says your earlier answer counted when an edit was not sent in time', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<GamePage session={answeringSessions.trivia.submitted} />)
    await user.click(screen.getByRole('radio', { name: 'Mars' }))

    rerender(<GamePage session={revealedSessions.trivia} />)
    expect(screen.getByText(/before your latest change was sent/)).toHaveTextContent(
      'Your earlier answer counted.',
    )
  })

  it('says so when you had not answered at all', () => {
    const { rerender } = render(<GamePage session={answeringSessions.social.notSubmitted} />)
    rerender(<GamePage session={{ ...revealedSessions.social, myAnswer: null }} />)
    expect(screen.getByText('The host revealed the round before you answered.')).toBeInTheDocument()
  })

  it('shows no notice when your answer was already saved', () => {
    const { rerender } = render(<GamePage session={answeringSessions.trivia.submitted} />)
    rerender(<GamePage session={revealedSessions.trivia} />)
    expect(screen.queryByText(/The host revealed the round/)).not.toBeInTheDocument()
  })

  it('shows no notice when the page first loads on the results', () => {
    render(<GamePage session={{ ...revealedSessions.trivia, myAnswer: null }} />)
    expect(screen.queryByText(/The host revealed the round/)).not.toBeInTheDocument()
  })

  it('clears the notice when the next round starts', () => {
    const { rerender } = render(<GamePage session={answeringSessions.social.notSubmitted} />)
    rerender(<GamePage session={{ ...revealedSessions.social, myAnswer: null }} />)
    rerender(<GamePage session={nextRound(answeringSessions.social.notSubmitted)} />)
    expect(screen.queryByText(/The host revealed the round/)).not.toBeInTheDocument()
  })

  it('refetches when a submit fails because the round was locked', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(answeringSessions.trivia.notSubmitted)
    mockedSubmitAnswer.mockRejectedValueOnce(createAppError('ROUND_NOT_ANSWERING'))
    render(<GamePage session={session} />)

    await user.click(screen.getByRole('radio', { name: 'Mars' }))
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Answers are locked for this round.')
    expect(refresh).toHaveBeenCalledOnce()
  })
})

describe('a failed submission', () => {
  it('says the answer was not sent, keeps the draft, and lets you retry', async () => {
    const user = userEvent.setup()
    const { session, refresh } = withRefresh(answeringSessions['word-guessing'].notSubmitted)
    mockedSubmitAnswer.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<GamePage session={session} />)

    await user.type(screen.getByRole('textbox'), 'penguin')
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your answer wasn’t sent')
    expect(alert).toHaveTextContent(/offline or the connection dropped/)
    expect(screen.getByRole('textbox')).toHaveValue('penguin')
    expect(refresh).not.toHaveBeenCalled()

    mockedSubmitAnswer.mockResolvedValueOnce()
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(mockedSubmitAnswer).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('clears the failure message once you change your answer', async () => {
    const user = userEvent.setup()
    mockedSubmitAnswer.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<GamePage session={answeringSessions.trivia.notSubmitted} />)

    await user.click(screen.getByRole('radio', { name: 'Mars' }))
    await user.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Venus' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('correctness is never colour alone', () => {
  it.each(['trivia', 'word-guessing'] as const)(
    '%s shows ✓ Correct and ✗ Incorrect as text',
    (mode) => {
      render(<GamePage session={revealedSessions[mode]} />)
      expect(screen.getAllByText(/✓ Correct/)).not.toHaveLength(0)
      expect(screen.getAllByText(/✗ Incorrect/)).not.toHaveLength(0)
    },
  )
})
