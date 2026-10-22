import { useEffect, useRef, type ReactNode } from 'react'
import type { RevealSnapshot, RoomSession, RoundResult } from '../../types/game'
import { answerLabel, playerName } from './answerLabel'
import { MODE_INFO } from './modes'
import './game.css'

export interface ResultsViewProps {
  session: RoomSession
  /** Slot for C's `Leaderboard`. `GamePage` fills it. */
  leaderboard?: ReactNode
  /** Slot for host controls (wired in Phase 3). */
  children?: ReactNode
}

function outcome(reveal: RevealSnapshot, session: RoomSession): string {
  switch (reveal.mode) {
    case 'trivia': {
      const prompt = session.currentRound?.promptSnapshot
      const choices = prompt?.mode === 'trivia' ? prompt.choices : []
      const label = choices.find((c) => c.id === reveal.correctChoiceId)?.label
      return `Correct answer: ${label ?? reveal.correctChoiceId}`
    }
    case 'word-guessing': {
      const others = reveal.acceptedAnswers.filter(
        (a) => a.toLowerCase() !== reveal.targetAnswer.toLowerCase(),
      )
      return others.length > 0
        ? `Correct answer: ${reveal.targetAnswer} (also accepted: ${others.join(', ')})`
        : `Correct answer: ${reveal.targetAnswer}`
    }
    case 'social': {
      const top = Math.max(0, ...reveal.results.map((r) => r.pointsAwarded))
      if (top === 0) return 'No votes this round.'
      const winners = reveal.results
        .filter((r) => r.pointsAwarded === top)
        .map((r) => playerName(r.playerId, session.players))
      const votes = top === 1 ? 'vote' : 'votes'
      return winners.length === 1
        ? `Most votes: ${winners[0]} (${top} ${votes})`
        : `Tied for most votes: ${winners.join(', ')} (${top} ${votes} each)`
    }
  }
}

/** Icon plus text, so correctness never relies on colour alone. Null for social rounds. */
function correctness(result: RoundResult): string | null {
  if (result.isCorrect === null) return null
  return result.isCorrect ? '✓ Correct' : '✗ Incorrect'
}

/** The revealed state of a round. Everything comes from `round.revealSnapshot`. */
export function ResultsView({ session, leaderboard, children }: ResultsViewProps) {
  const round = session.currentRound
  const reveal = round?.revealSnapshot
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Results replace the round on reveal, so focus lands on the results heading.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  if (!round || !reveal) return null

  return (
    <section className="game-results" aria-labelledby="game-results-heading">
      <p className="game-round__meta">
        Round {round.roundNumber} of {session.room.roundLimit} · {MODE_INFO[round.mode].label}
      </p>
      <h1 id="game-results-heading" ref={headingRef} tabIndex={-1}>
        Results
      </h1>
      <p className="game-results__prompt">{round.promptSnapshot.prompt}</p>
      <p className="game-results__outcome">{outcome(reveal, session)}</p>

      <div className="game-results__scroll">
        <table className="game-results__table">
          <caption className="visually-hidden">Answers and points this round</caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">{reveal.mode === 'social' ? 'Voted for' : 'Answer'}</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {reveal.results.map((result) => {
              const mark = correctness(result)
              return (
                <tr key={result.playerId}>
                  <th scope="row">
                    {playerName(result.playerId, session.players)}
                    {result.playerId === session.me.id && ' (you)'}
                  </th>
                  <td>
                    {answerLabel(result.answer, round.promptSnapshot, session.players)}
                    {mark && (
                      <span
                        className={result.isCorrect ? 'game-mark game-mark--correct' : 'game-mark'}
                      >
                        {' '}
                        {mark}
                      </span>
                    )}
                  </td>
                  <td>+{result.pointsAwarded}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {leaderboard && <div className="game-results__leaderboard">{leaderboard}</div>}
      {children}
    </section>
  )
}
