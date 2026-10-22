import { useState } from 'react'
import type { RoomSession, RoundStatus } from '../../types/game'
import { Leaderboard } from '../leaderboard/Leaderboard'
import { HostResultsControls, HostRoundControls } from './HostControls'
import { ResultsView } from './ResultsView'
import { RoundView } from './RoundView'
import './game.css'

export interface GamePageProps {
  session: RoomSession
}

/**
 * Rendered by `RoomPage` when `room.status` is `playing`. Shows the round while it is answering
 * and the results once it is revealed. Host controls render only for the host; the RPCs also
 * reject anyone else.
 */
export function GamePage({ session }: GamePageProps) {
  const round = session.currentRound
  const [dirty, setDirty] = useState(false)
  const [seen, setSeen] = useState<{ id: string; status: RoundStatus } | null>(
    round && { id: round.id, status: round.status },
  )
  const [notice, setNotice] = useState<string | null>(null)

  // Notice when the round changes under the player (the host revealed while they were still
  // answering). Adjusting state during render is React's pattern for reacting to a prop change.
  if (round && (seen?.id !== round.id || seen.status !== round.status)) {
    const revealedUnderYou =
      seen?.id === round.id && seen.status === 'answering' && round.status === 'revealed'
    setSeen({ id: round.id, status: round.status })
    setNotice(revealedUnderYou ? revealNotice(dirty, session.myAnswer !== null) : null)
    setDirty(false)
  }

  if (!round) {
    return (
      <main className="app-main">
        <p role="status">Waiting for the host to start the round…</p>
      </main>
    )
  }

  if (round.status === 'revealed') {
    return (
      <main className="app-main">
        {notice && (
          <p className="game-notice" role="status">
            {notice}
          </p>
        )}
        <ResultsView
          session={session}
          leaderboard={
            <Leaderboard
              players={session.players}
              highlightPlayerId={session.me.id}
              lastRoundPoints={Object.fromEntries(
                (round.revealSnapshot?.results ?? []).map((r) => [r.playerId, r.pointsAwarded]),
              )}
            />
          }
        >
          {session.isHost ? (
            <HostResultsControls key={round.id} session={session} round={round} />
          ) : (
            <p className="game-host-wait" role="status">
              {round.roundNumber >= session.room.roundLimit
                ? 'That was the last round. Waiting for the host to end the game…'
                : 'Waiting for the host to start the next round…'}
            </p>
          )}
        </ResultsView>
      </main>
    )
  }

  return (
    <main className="app-main">
      {/* Keyed by round so a new round starts with an empty draft. */}
      <RoundView key={round.id} session={session} onDirtyChange={setDirty} />
      {session.isHost && <HostRoundControls key={round.id} session={session} round={round} />}
    </main>
  )
}

/** What to tell a player whose round was revealed before they finished answering. */
function revealNotice(dirty: boolean, answered: boolean): string | null {
  if (dirty && answered) {
    return 'The host revealed the round before your latest change was sent. Your earlier answer counted.'
  }
  if (dirty) return 'The host revealed the round before your answer was sent.'
  if (!answered) return 'The host revealed the round before you answered.'
  return null
}
