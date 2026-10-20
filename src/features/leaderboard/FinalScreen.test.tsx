import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AVA_ID, CLEO_ID, finishedSingleWinner, finishedTie, viewAs } from '../../test/fixtures'
import type { RoomSession } from '../../types/game'
import { FinalScreen } from './FinalScreen'

function renderFinal(session: RoomSession) {
  render(
    <MemoryRouter>
      <FinalScreen session={session} />
    </MemoryRouter>,
  )
}

function withScores(base: RoomSession, scores: number[]): RoomSession {
  const players = base.players.map((p, i) => ({ ...p, score: scores[i] }))
  return { ...base, players, me: players.find((p) => p.id === base.me.id)! }
}

describe('FinalScreen', () => {
  it('announces a single winner', () => {
    renderFinal(finishedSingleWinner)
    expect(screen.getByRole('heading', { level: 1, name: 'Game over' })).toBeInTheDocument()
    expect(screen.getByText('🏆 Ava wins!')).toBeInTheDocument()
    expect(screen.getByText('With 4 points.')).toBeInTheDocument()
    expect(screen.queryByText(/tie/i)).not.toBeInTheDocument()
  })

  it('marks the viewer when they won', () => {
    renderFinal(viewAs(finishedSingleWinner, AVA_ID))
    expect(screen.getByText('🏆 Ava (you) wins!')).toBeInTheDocument()
  })

  it('shows every tied winner', () => {
    renderFinal(finishedTie)
    expect(screen.getByText('🏆 It’s a tie!')).toBeInTheDocument()
    expect(
      screen.getByText('Ava and Ben (you) share the top score with 3 points.'),
    ).toBeInTheDocument()
  })

  it('treats nobody scoring as a tie between everyone', () => {
    renderFinal(viewAs(withScores(finishedTie, [0, 0, 0]), CLEO_ID))
    expect(screen.getByText('🏆 It’s a tie!')).toBeInTheDocument()
    expect(
      screen.getByText('Ava, Ben and Cleo (you) share the top score with 0 points.'),
    ).toBeInTheDocument()
  })

  it('uses "point" for a score of 1', () => {
    renderFinal(withScores(finishedSingleWinner, [1, 0, 0]))
    expect(screen.getByText('With 1 point.')).toBeInTheDocument()
  })

  it('shows the final leaderboard with the viewer marked', () => {
    renderFinal(finishedSingleWinner)
    expect(screen.getByRole('heading', { level: 2, name: 'Final scores' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Ben (you)' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'This round' })).not.toBeInTheDocument()
  })

  it('links home to create a new room', () => {
    renderFinal(finishedTie)
    expect(screen.getByRole('link', { name: 'Create a new room' })).toHaveAttribute('href', '/')
  })
})
