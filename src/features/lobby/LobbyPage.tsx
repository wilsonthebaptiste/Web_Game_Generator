// STUB from chore/scaffold. Ownership passes to Contributor A once the scaffold merges.
import type { RoomSession } from '../../types/game'

export interface LobbyPageProps {
  session: RoomSession
}

/** Rendered by `RoomPage` when `room.status` is `lobby`. */
export function LobbyPage({ session }: LobbyPageProps) {
  return (
    <main className="app-main">
      <h1>Lobby {session.room.code}</h1>
      <p>Lobby coming soon.</p>
    </main>
  )
}
