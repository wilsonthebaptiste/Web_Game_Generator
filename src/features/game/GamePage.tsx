import type { RoomSession } from '../../types/game'
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
      <RoundView key={round.id} session={session} />
      {session.isHost && <HostRoundControls key={round.id} session={session} round={round} />}
    </main>
  )
}
