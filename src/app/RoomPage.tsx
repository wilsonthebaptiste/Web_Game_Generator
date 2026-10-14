import { Link, Navigate, useParams } from 'react-router-dom'
import { ErrorMessage } from '../components/ErrorMessage'
import { LoadingState } from '../components/LoadingState'
import { GamePage } from '../features/game/GamePage'
import { LobbyPage } from '../features/lobby/LobbyPage'
import { normalizeRoomCode } from '../lib/roomCodes'
import type { AppErrorCode, RoomSession } from '../types/game'
import { useRoomSession } from './useRoomSession'

/** Errors where retrying can't help, so the page offers a way home instead. */
const DEAD_END_CODES: readonly AppErrorCode[] = [
  'ROOM_NOT_FOUND',
  'ROOM_EXPIRED',
  'INVALID_ROOM_CODE',
]

/** `/room/:code`. Loads the room and shows the view for its status. */
export function RoomPage() {
  const { code = '' } = useParams<{ code: string }>()
  const state = useRoomSession(code)

  if (state.status === 'loading') {
    return (
      <main className="app-main">
        <LoadingState label="Connecting to the room…" />
      </main>
    )
  }

  if (state.status === 'error') {
    const { error, retry } = state
    // Someone opened a room link without joining: send them to the join form, code prefilled.
    if (error.code === 'NOT_A_MEMBER') {
      return <Navigate to={`/join/${normalizeRoomCode(code)}`} replace />
    }
    const deadEnd = DEAD_END_CODES.includes(error.code)
    return (
      <main className="app-main">
        <ErrorMessage
          title={deadEnd ? "Can't open this room" : 'Something went wrong'}
          message={error.message}
          onRetry={deadEnd ? undefined : retry}
        />
        <p>
          <Link to="/">Go to the home page</Link> to create or join a room.
        </p>
      </main>
    )
  }

  return <RoomView session={state.session} />
}

function RoomView({ session }: { session: RoomSession }) {
  switch (session.room.status) {
    case 'lobby':
      return <LobbyPage session={session} />
    case 'playing':
      return <GamePage session={session} />
    case 'finished':
      // Placeholder until FinalScreen (feat/final-screen, Phase 4).
      return (
        <main className="app-main">
          <h1>Game over</h1>
          <p>
            <Link to="/">Create a new room</Link>
          </p>
        </main>
      )
  }
}
