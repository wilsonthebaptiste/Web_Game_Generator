// STUB from chore/scaffold. Ownership passes to Contributor B once the scaffold merges.
import type { RoomSession } from '../../types/game'

export interface GamePageProps {
  session: RoomSession
}

/** Rendered by `RoomPage` when `room.status` is `playing`. */
export function GamePage({ session }: GamePageProps) {
  return (
    <main className="app-main">
      <h1>Round {session.currentRound?.roundNumber ?? '–'}</h1>
      <p>Game coming soon.</p>
    </main>
  )
}
