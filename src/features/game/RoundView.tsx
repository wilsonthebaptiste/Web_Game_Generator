import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { toAppError } from '../../lib/errors'
import { submitAnswer } from '../../services/answers'
import type { AnswerPayload, AppErrorCode, PromptSnapshot, RoomSession } from '../../types/game'
import { MODE_INFO } from './modes'
import { PlayerVote } from './PlayerVote'
import { validateAnswerPayload } from './rules/validatePayload'
import { TriviaChoices } from './TriviaChoices'
import { WordGuessInput } from './WordGuessInput'
import './game.css'

export interface RoundViewProps {
  session: RoomSession
  /** Sends the answer. Defaults to `submitAnswer` followed by `session.refresh()`. */
  onSubmit?: (roundId: string, payload: AnswerPayload) => Promise<void>
  /** Told whether the draft holds a change that hasn't been sent yet. */
  onDirtyChange?: (dirty: boolean) => void
}

/** Draft input for every mode. Only the field for the current mode is used. */
interface Draft {
  choiceId: string | null
  text: string
  votedPlayerId: string | null
}

function draftFrom(answer: AnswerPayload | null): Draft {
  return {
    choiceId: answer && 'choiceId' in answer ? answer.choiceId : null,
    text: answer && 'text' in answer ? answer.text : '',
    votedPlayerId: answer && 'votedPlayerId' in answer ? answer.votedPlayerId : null,
  }
}

/** True when the draft differs from the saved answer (or is filled in with nothing saved). */
function isDirty(prompt: PromptSnapshot, draft: Draft, saved: AnswerPayload | null): boolean {
  const base = draftFrom(saved)
  switch (prompt.mode) {
    case 'trivia':
      return draft.choiceId !== base.choiceId
    case 'word-guessing':
      return draft.text.trim() !== base.text.trim()
    case 'social':
      return draft.votedPlayerId !== base.votedPlayerId
  }
}

/** Errors that mean the round moved on under the player, so the session should catch up. */
const ROUND_MOVED_ON = new Set<AppErrorCode>([
  'ROUND_NOT_ANSWERING',
  'ROUND_ALREADY_REVEALED',
  'ROUND_NOT_FOUND',
])

function payloadFrom(prompt: PromptSnapshot, draft: Draft): unknown {
  switch (prompt.mode) {
    case 'trivia':
      return { choiceId: draft.choiceId }
    case 'word-guessing':
      return { text: draft.text }
    case 'social':
      return { votedPlayerId: draft.votedPlayerId }
  }
}

/**
 * The answering state of a round. Everything shown comes from `round.promptSnapshot`, the
 * player list, and the viewer's own `myAnswer`. Other players' answers never reach this view.
 */
export function RoundView({ session, onSubmit, onDirtyChange }: RoundViewProps) {
  const round = session.currentRound
  const [draft, setDraft] = useState<Draft>(() => draftFrom(session.myAnswer))
  const [pending, setPending] = useState(false)
  /** A validation problem: shown inline, nothing was sent. */
  const [error, setError] = useState<string | null>(null)
  /** The request failed: the answer was not saved. */
  const [sendError, setSendError] = useState<string | null>(null)
  const promptRef = useRef<HTMLHeadingElement>(null)
  const dirty = round ? isDirty(round.promptSnapshot, draft, session.myAnswer) : false

  // A new round mounts a new RoundView (it is keyed by round), so this moves focus to the
  // new prompt each time a round starts.
  useEffect(() => {
    promptRef.current?.focus()
  }, [])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  // Blocks a second submit before React re-renders the disabled button.
  const inFlight = useRef(false)

  if (!round) return null
  const prompt = round.promptSnapshot
  const submitted = session.myAnswer !== null

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
    setSendError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current) return
    const result = validateAnswerPayload(prompt.mode, payloadFrom(prompt, draft), {
      myPlayerId: session.me.id,
      playerIds: session.players.map((p) => p.id),
      choiceIds: prompt.mode === 'trivia' ? prompt.choices.map((c) => c.id) : undefined,
      allowSelfVote: prompt.mode === 'social' ? prompt.allowSelfVote : undefined,
    })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    inFlight.current = true
    setPending(true)
    setError(null)
    setSendError(null)
    try {
      if (onSubmit) {
        await onSubmit(round.id, result.value)
      } else {
        await submitAnswer(round.id, result.value)
        await session.refresh()
      }
    } catch (err) {
      const appError = toAppError(err)
      setSendError(appError.message)
      // The host revealed while this was in flight: refetch so the results replace the form.
      if (ROUND_MOVED_ON.has(appError.code)) void session.refresh()
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <section className="game-round" aria-labelledby="game-round-prompt">
      <p className="game-round__meta">
        Round {round.roundNumber} of {session.room.roundLimit} · {MODE_INFO[round.mode].label}
      </p>
      <h1 id="game-round-prompt" className="game-round__prompt" ref={promptRef} tabIndex={-1}>
        {prompt.prompt}
      </h1>
      {prompt.mode === 'social' && prompt.instructions && (
        <p className="game-round__instructions">{prompt.instructions}</p>
      )}

      <form className="game-round__form" onSubmit={handleSubmit} noValidate>
        {prompt.mode === 'trivia' && (
          <TriviaChoices
            choices={prompt.choices}
            value={draft.choiceId}
            onChange={(choiceId) => update({ choiceId })}
            disabled={pending}
          />
        )}
        {prompt.mode === 'word-guessing' && (
          <WordGuessInput
            value={draft.text}
            onChange={(text) => update({ text })}
            disabled={pending}
          />
        )}
        {prompt.mode === 'social' && (
          <PlayerVote
            players={session.players}
            myPlayerId={session.me.id}
            allowSelfVote={prompt.allowSelfVote}
            value={draft.votedPlayerId}
            onChange={(votedPlayerId) => update({ votedPlayerId })}
            disabled={pending}
          />
        )}

        {error && (
          <p className="game-round__error" role="alert">
            {error}
          </p>
        )}
        {sendError && <ErrorMessage title="Your answer wasn’t sent" message={sendError} />}

        <Button type="submit" fullWidth isLoading={pending} loadingText="Submitting…">
          {submitted ? 'Update answer' : 'Submit answer'}
        </Button>
      </form>

      <div className="game-round__status" role="status">
        <p>
          {submitted
            ? 'Answer submitted ✓ (you can change it until the host reveals)'
            : 'Waiting for your answer'}
        </p>
        <p>
          {round.submissionCount} / {session.players.length} submitted · Waiting for reveal
        </p>
      </div>
    </section>
  )
}
