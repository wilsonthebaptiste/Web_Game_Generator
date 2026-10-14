import { render, screen, within } from '@testing-library/react'
import { answeringSessions, revealedSessions } from '../../test/fixtures'
import type { RoomSession, RoundResult } from '../../types/game'
import { ResultsView } from './ResultsView'

function rowFor(name: RegExp) {
  return screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement
}

function withResults(base: RoomSession, results: RoundResult[]): RoomSession {
  const round = base.currentRound!
  return {
    ...base,
    currentRound: { ...round, revealSnapshot: { ...round.revealSnapshot!, results } },
  }
}

describe('ResultsView', () => {
  it('renders nothing while the round is still answering', () => {
    const { container } = render(<ResultsView session={answeringSessions.trivia.submitted} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('trivia: shows the correct choice, every answer, correctness and points', () => {
    render(<ResultsView session={revealedSessions.trivia} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Results' })).toBeInTheDocument()
    expect(screen.getByText(/Round 2 of 10 · Trivia/)).toBeInTheDocument()
    expect(screen.getByText('Which planet is known as the Red Planet?')).toBeInTheDocument()
    expect(screen.getByText('Correct answer: Mars')).toBeInTheDocument()

    expect(rowFor(/Ava/)).toHaveTextContent('Mars ✓ Correct+1')
    expect(rowFor(/Ben \(you\)/)).toHaveTextContent('Venus ✗ Incorrect+0')
    expect(rowFor(/Cleo/)).toHaveTextContent('No answer ✗ Incorrect+0')
  })

  it('word guessing: shows the target, accepted variants and each guess', () => {
    render(<ResultsView session={revealedSessions['word-guessing']} />)
    expect(
      screen.getByText('Correct answer: Penguin (also accepted: penguins)'),
    ).toBeInTheDocument()
    expect(rowFor(/Ava/)).toHaveTextContent('penguin ✓ Correct+1')
    expect(rowFor(/Ben/)).toHaveTextContent('Puffin ✗ Incorrect+0')
    expect(within(rowFor(/Cleo/)).getByText(/No answer/)).toBeInTheDocument()
  })

  it('social: shows who got the most votes, who each player voted for, and votes received', () => {
    render(<ResultsView session={revealedSessions.social} />)
    expect(screen.getByText('Most votes: Ben (2 votes)')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Voted for' })).toBeInTheDocument()
    expect(rowFor(/Ava/)).toHaveTextContent('Ben+1')
    expect(rowFor(/Ben/)).toHaveTextContent('Ava+2')
    expect(rowFor(/Cleo/)).toHaveTextContent('Ben+0')
    expect(screen.queryByText(/Correct/)).not.toBeInTheDocument()
  })

  it('social: shows a tie and missing votes', () => {
    const session = withResults(revealedSessions.social, [
      {
        playerId: 'player-ava',
        answer: { votedPlayerId: 'player-ben' },
        pointsAwarded: 1,
        isCorrect: null,
      },
      {
        playerId: 'player-ben',
        answer: { votedPlayerId: 'player-ava' },
        pointsAwarded: 1,
        isCorrect: null,
      },
      { playerId: 'player-cleo', answer: null, pointsAwarded: 0, isCorrect: null },
    ])
    render(<ResultsView session={session} />)
    expect(screen.getByText('Tied for most votes: Ava, Ben (1 vote each)')).toBeInTheDocument()
    expect(rowFor(/Cleo/)).toHaveTextContent('No answer+0')
  })

  it('social: says so when nobody voted', () => {
    const session = withResults(revealedSessions.social, [
      { playerId: 'player-ava', answer: null, pointsAwarded: 0, isCorrect: null },
      { playerId: 'player-ben', answer: null, pointsAwarded: 0, isCorrect: null },
    ])
    render(<ResultsView session={session} />)
    expect(screen.getByText('No votes this round.')).toBeInTheDocument()
    expect(screen.getAllByText('No answer')).toHaveLength(2)
  })

  it('renders the leaderboard slot and children', () => {
    render(
      <ResultsView session={revealedSessions.trivia} leaderboard={<p>Leaderboard here</p>}>
        <button type="button">Next round</button>
      </ResultsView>,
    )
    expect(screen.getByText('Leaderboard here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next round' })).toBeInTheDocument()
  })
})
