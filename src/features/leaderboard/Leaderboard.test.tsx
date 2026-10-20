import { render, screen, within } from '@testing-library/react'
import { BEN_ID, finishedSingleWinner, finishedTie, revealedSessions } from '../../test/fixtures'
import { Leaderboard } from './Leaderboard'
import { roundPoints } from './winners'

/** Each body row's cells as text, e.g. ['1', 'Ava', '4']. */
function rows() {
  const [, body] = screen.getAllByRole('rowgroup')
  return within(body)
    .getAllByRole('row')
    .map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent))
}

describe('Leaderboard', () => {
  it('lists players by score with their rank', () => {
    const players = [...finishedSingleWinner.players].reverse()
    render(<Leaderboard players={players} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Leaderboard' })).toBeInTheDocument()
    expect(rows()).toEqual([
      ['1', 'Ava', '4'],
      ['2', 'Ben', '2'],
      ['3', 'Cleo', '1'],
    ])
    expect(screen.queryByRole('columnheader', { name: 'This round' })).not.toBeInTheDocument()
  })

  it('gives tied players the same rank and says so in text', () => {
    render(<Leaderboard players={finishedTie.players} />)
    expect(rows()).toEqual([
      ['1 (tied)', 'Ava', '3'],
      ['1 (tied)', 'Ben', '3'],
      ['3', 'Cleo', '1'],
    ])
  })

  it('marks the viewer with text, not only colour', () => {
    render(<Leaderboard players={finishedTie.players} highlightPlayerId={BEN_ID} />)
    const me = screen.getByRole('rowheader', { name: 'Ben (you)' })
    expect(me.closest('tr')).toHaveClass('lb__row--me')
    expect(screen.getAllByText(/\(you\)/)).toHaveLength(1)
  })

  it('shows each player’s points from the last round', () => {
    const session = revealedSessions.social
    render(
      <Leaderboard
        players={session.players}
        lastRoundPoints={roundPoints(session.currentRound!.revealSnapshot)}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'This round' })).toBeInTheDocument()
    expect(rows()).toEqual([
      ['1 (tied)', 'Ava', '2', '+1'],
      ['1 (tied)', 'Ben', '2', '+2'],
      ['3', 'Cleo', '1', '+0'],
    ])
  })

  it('shows +0 for a player missing from lastRoundPoints', () => {
    render(<Leaderboard players={finishedSingleWinner.players} lastRoundPoints={{}} />)
    expect(rows().map((r) => r[3])).toEqual(['+0', '+0', '+0'])
  })

  it('takes a custom heading and handles an empty room', () => {
    render(<Leaderboard players={[]} heading="Final scores" />)
    expect(screen.getByRole('heading', { name: 'Final scores' })).toBeInTheDocument()
    expect(screen.getByText('No players yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
