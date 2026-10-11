import { useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'

/**
 * Placeholder. `feat/room-session` adds `useRoomSession(code)` and switches on
 * `room.status`: lobby → LobbyPage, playing → GamePage, finished → FinalScreen.
 */
export function RoomPage() {
  const { code } = useParams<{ code: string }>()

  return (
    <main className="app-main">
      <h1>Room {code}</h1>
      <LoadingState label="Connecting to the room…" />
    </main>
  )
}
