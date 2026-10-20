import { useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { toAppError } from '../../lib/errors'
import { endGame } from '../../services/rooms'
import { revealRound, startRound } from '../../services/rounds'
import type { GameMode, RoomSession, Round } from '../../types/game'
import { ModePicker } from './ModePicker'

interface HostControlsProps {
  session: RoomSession
  round: Round
}

type HostAction = 'reveal' | 'next' | 'end'

/**
 * Runs one host action at a time. The ref blocks a second click before React re-renders the
 * disabled button, so a double click can never fire an RPC twice.
 */
function useHostAction(session: RoomSession) {
  const inFlight = useRef(false)
  const [pending, setPending] = useState<HostAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: HostAction, call: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(action)
    setError(null)
    try {
      await call()
    } catch (err) {
      inFlight.current = false
      setPending(null)
      setError(toAppError(err).message)
      return
    }
    // Stay disabled: the session refetch (or realtime) swaps in the next view and remounts
    // these controls, which resets the guard.
    await session.refresh()
  }

  return { pending, error, run }
}

/** Host-only "Lock & reveal" while the round is answering. */
export function HostRoundControls({ session, round }: HostControlsProps) {
  const { pending, error, run } = useHostAction(session)

  return (
    <section className="game-host" aria-label="Host controls">
      <Button
        variant="secondary"
        fullWidth
        onClick={() => void run('reveal', () => revealRound(round.id))}
        isLoading={pending === 'reveal'}
        loadingText="Revealing…"
      >
        Lock &amp; reveal
      </Button>
      {error !== null && <ErrorMessage title="Couldn’t reveal the round" message={error} />}
    </section>
  )
}

/** Host-only next-round picker and "End game" on the results screen. */
export function HostResultsControls({ session, round }: HostControlsProps) {
  const { room } = session
  const { pending, error, run } = useHostAction(session)
  const [mode, setMode] = useState<GameMode | null>(room.selectedMode ?? round.mode)
  const isLastRound = round.roundNumber >= room.roundLimit
  const busy = pending !== null

  return (
    <section className="game-host" aria-label="Host controls">
      {!isLastRound && (
        <>
          <ModePicker
            value={mode}
            onChange={setMode}
            disabled={busy}
            legend="Mode for the next round"
          />
          <Button
            fullWidth
            onClick={() => mode !== null && void run('next', () => startRound(room.id, mode))}
            disabled={mode === null || (busy && pending !== 'next')}
            isLoading={pending === 'next'}
            loadingText="Starting round…"
          >
            Next round
          </Button>
        </>
      )}
      <Button
        variant={isLastRound ? 'primary' : 'danger'}
        fullWidth
        onClick={() => void run('end', () => endGame(room.id))}
        disabled={busy && pending !== 'end'}
        isLoading={pending === 'end'}
        loadingText="Ending game…"
      >
        End game
      </Button>
      {error !== null && <ErrorMessage title="That didn’t work" message={error} />}
    </section>
  )
}
