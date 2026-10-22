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

describe('ResultsView: coverage gaps', () => {
  it('shows the round number and mode', () => {
    render(<ResultsView session={revealedSessions['word-guessing']} />)
    expect(screen.getByText('Round 2 of 10 · Word guessing')).toBeInTheDocument()
  })

  it('marks only the viewer’s row with "(you)"', () => {
    render(<ResultsView session={revealedSessions.trivia} />)
    expect(screen.getAllByText(/\(you\)/)).toHaveLength(1)
    expect(rowFor(/Ben/)).toHaveTextContent('(you)')
  })

  it('leaves out "also accepted" when there are no other variants', () => {
    const base = revealedSessions['word-guessing']
    const round = base.currentRound!
    const session: RoomSession = {
      ...base,
      currentRound: {
        ...round,
        revealSnapshot: {
          mode: 'word-guessing',
          targetAnswer: 'Penguin',
          acceptedAnswers: ['PENGUIN'],
          results: round.revealSnapshot!.results,
        },
      },
    }
    render(<ResultsView session={session} />)
    expect(screen.getByText('Correct answer: Penguin')).toBeInTheDocument()
    expect(screen.queryByText(/also accepted/)).not.toBeInTheDocument()
  })

  it('falls back to the choice id when the correct choice is not in the prompt', () => {
    const base = revealedSessions.trivia
    const round = base.currentRound!
    const session: RoomSession = {
      ...base,
      currentRound: {
        ...round,
        revealSnapshot: {
          mode: 'trivia',
          correctChoiceId: 'z',
          results: round.revealSnapshot!.results,
        },
      },
    }
    render(<ResultsView session={session} />)
    expect(screen.getByText('Correct answer: z')).toBeInTheDocument()
  })

  it('names a player who left instead of showing an id', () => {
    const session = withResults(revealedSessions.social, [
      ...revealedSessions.social.currentRound!.revealSnapshot!.results,
      { playerId: 'gone', answer: { votedPlayerId: 'gone' }, pointsAwarded: 0, isCorrect: null },
    ])
    render(<ResultsView session={session} />)
    expect(screen.getAllByText('A player who left').length).toBeGreaterThan(0)
    expect(screen.queryByText('gone')).not.toBeInTheDocument()
  })

  it('shows no ✓ or ✗ in a social round', () => {
    render(<ResultsView session={revealedSessions.social} />)
    expect(screen.queryByText(/✓|✗/)).not.toBeInTheDocument()
  })

  it('shows the points each player got this round with a plus sign', () => {
    render(<ResultsView session={revealedSessions.social} />)
    expect(within(rowFor(/Ben/)).getByText('+2')).toBeInTheDocument()
    expect(within(rowFor(/Cleo/)).getByText('+0')).toBeInTheDocument()
  })
})
