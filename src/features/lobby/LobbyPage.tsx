import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ERROR_MESSAGES, toAppError } from '../../lib/errors'
import { startRound } from '../../services/rounds'
import { GAME_LIMITS, type GameMode, type Player, type RoomSession } from '../../types/game'
import { ModePicker } from '../game/ModePicker'
import './lobby.css'

export interface LobbyPageProps {
  session: RoomSession
}

/** Rendered by `RoomPage` when `room.status` is `lobby`. */
export function LobbyPage({ session }: LobbyPageProps) {
  const { room, players, me, isHost } = session
  const playersHeadingId = useId()

  return (
    <main className="app-main lobby">
      {/* The code is shown large below; keep it in the heading for screen readers. */}
      <h1>
        Lobby <span className="visually-hidden">{room.code}</span>
      </h1>

      <section className="lobby-share" aria-label="Invite players">
        <p className="lobby-share__label">Room code</p>
        <p className="lobby-code">{room.code}</p>
        <CopyJoinLink code={room.code} />
      </section>

      <section className="lobby-players" aria-labelledby={playersHeadingId}>
        <h2 id={playersHeadingId}>Players ({players.length})</h2>
        {players.length === 0 ? (
          <p className="lobby-muted">No one has joined yet.</p>
        ) : (
          <ul className="lobby-player-list" aria-labelledby={playersHeadingId}>
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                isHost={player.id === room.hostPlayerId}
                isMe={player.id === me.id}
              />
            ))}
          </ul>
        )}
        {players.length === 1 && (
          <p className="lobby-muted">Waiting for others to join. Share the code or the link.</p>
        )}
      </section>

      {isHost ? (
        <HostControls session={session} />
      ) : (
        <p className="lobby-waiting" role="status">
          Waiting for host to start…
        </p>
      )}
    </main>
  )
}

function HostControls({ session }: { session: RoomSession }) {
  const { room, players } = session
  const reasonId = useId()
  const [mode, setMode] = useState<GameMode | null>(room.selectedMode)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Blocks a second click before React re-renders the disabled button.
  const inFlight = useRef(false)

  const blockedReason =
    players.length < GAME_LIMITS.minPlayersToStart
      ? ERROR_MESSAGES.NOT_ENOUGH_PLAYERS
      : mode === null
        ? 'Choose a game mode to start.'
        : null

  async function start() {
    if (inFlight.current || blockedReason !== null || mode === null) return
    inFlight.current = true
    setStarting(true)
    setError(null)
    try {
      await startRound(room.id, mode)
    } catch (err) {
      inFlight.current = false
      setStarting(false)
      setError(toAppError(err).message)
      return
    }
    // The room is now `playing`. Stay disabled; RoomPage swaps in the game view once the
    // session catches up (here, or through realtime if this refetch fails).
    await session.refresh()
  }

  return (
    <section className="lobby-host" aria-label="Host controls">
      <ModePicker value={mode} onChange={setMode} disabled={starting} legend="Choose a game mode" />
      <div className="lobby-start">
        <Button
          fullWidth
          onClick={() => void start()}
          disabled={blockedReason !== null}
          isLoading={starting}
          loadingText="Starting game…"
          aria-describedby={blockedReason !== null ? reasonId : undefined}
        >
          Start game
        </Button>
        {blockedReason !== null && (
          <p id={reasonId} className="lobby-muted">
            {blockedReason}
          </p>
        )}
        {error !== null && <ErrorMessage title="Couldn’t start the game" message={error} />}
      </div>
    </section>
  )
}

function PlayerRow({ player, isHost, isMe }: { player: Player; isHost: boolean; isMe: boolean }) {
  return (
    <li className={['lobby-player', isMe && 'lobby-player--me'].filter(Boolean).join(' ')}>
      <span className="lobby-player__name">{player.displayName}</span>
      {isHost && (
        <span className="lobby-badge lobby-badge--host">
          <span className="lobby-badge__icon" aria-hidden="true">
            ★
          </span>{' '}
          Host
        </span>
      )}
      {isMe && <span className="lobby-badge lobby-badge--me">You</span>}
    </li>
  )
}

type CopyStatus = 'idle' | 'copied' | 'failed'

const COPY_MESSAGES: Record<CopyStatus, string> = {
  idle: '',
  copied: 'Link copied. Send it to the other players.',
  failed: 'Couldn’t copy automatically. Select the link above and copy it.',
}

function CopyJoinLink({ code }: { code: string }) {
  const inputId = useId()
  const joinLink = `${window.location.origin}/join/${code}`
  const [status, setStatus] = useState<CopyStatus>('idle')
  const resetTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function copy() {
    window.clearTimeout(resetTimer.current)
    try {
      // Clipboard access needs a secure context (https or localhost) and may be refused.
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(joinLink)
      setStatus('copied')
      resetTimer.current = window.setTimeout(() => setStatus('idle'), 4000)
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="lobby-link">
      <label className="lobby-share__label" htmlFor={inputId}>
        Join link
      </label>
      <div className="lobby-link__row">
        <input
          id={inputId}
          className="lobby-link__input"
          type="text"
          readOnly
          value={joinLink}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      <p
        className={`lobby-link__status${status === 'failed' ? ' lobby-link__status--failed' : ''}`}
        role="status"
      >
        {COPY_MESSAGES[status]}
      </p>
    </div>
  )
}
