import { useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorMessage } from '../../components/ErrorMessage'
import { Input } from '../../components/Input'
import { toAppError } from '../../lib/errors'
import { normalizeRoomCode } from '../../lib/roomCodes'
import { validateDisplayName, validateRoomCodeInput } from '../../lib/validation'
import { joinRoom } from '../../services/players'
import { createRoom } from '../../services/rooms'
import type { AppErrorCode, RoomMembership } from '../../types/game'
import './home.css'

// Server errors that belong next to one field rather than in the form-level error box.
const NAME_ERRORS: readonly AppErrorCode[] = ['NAME_INVALID', 'NAME_TAKEN']
const CODE_ERRORS: readonly AppErrorCode[] = ['INVALID_ROOM_CODE', 'ROOM_NOT_FOUND']

/** Rendered for `/` and `/join/:code` (code prefilled). */
export function HomePage() {
  const { code } = useParams<{ code?: string }>()
  // `/` and `/join/:code` render the same component, so reset the forms when the code changes.
  return <HomeContent key={code ?? ''} prefilledCode={code ? normalizeRoomCode(code) : ''} />
}

function HomeContent({ prefilledCode }: { prefilledCode: string }) {
  const navigate = useNavigate()
  const goToRoom = ({ room }: RoomMembership) => navigate(`/room/${room.code}`)

  const createForm = (
    <CreateRoomForm key="create" onCreated={goToRoom} secondary={Boolean(prefilledCode)} />
  )
  const joinForm = <JoinRoomForm key="join" prefilledCode={prefilledCode} onJoined={goToRoom} />

  return (
    <main className="app-main home">
      <header className="home-header">
        <h1>Party Game Generator</h1>
        <p className="home-intro">
          Trivia, word guessing, and social prompts for a group in the same room. One person creates
          a room, everyone else joins with the code.
        </p>
        {prefilledCode && (
          <p className="home-joining">
            You’re joining room <strong className="home-code">{prefilledCode}</strong>
          </p>
        )}
      </header>
      <div className="home-forms">
        {/* A shared join link puts the join form first. */}
        {prefilledCode ? [joinForm, createForm] : [createForm, joinForm]}
      </div>
    </main>
  )
}

/**
 * Submit state shared by both forms. `run` ignores a second submit while one is in flight,
 * even before React re-renders the disabled button, so a double click can't create two rooms.
 */
function useSubmit() {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      await action()
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return { pending, run }
}

interface CreateRoomFormProps {
  onCreated: (membership: RoomMembership) => void
  secondary: boolean
}

function CreateRoomForm({ onCreated, secondary }: CreateRoomFormProps) {
  const headingId = useId()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { pending, run } = useSubmit()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const validName = validateDisplayName(name)
    if (!validName.ok) {
      setNameError(validName.message)
      return
    }
    setNameError(null)

    void run(async () => {
      try {
        onCreated(await createRoom({ displayName: validName.value }))
      } catch (error) {
        const appError = toAppError(error)
        if (NAME_ERRORS.includes(appError.code)) setNameError(appError.message)
        else setFormError(appError.message)
      }
    })
  }

  return (
    <section className="home-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Create a room</h2>
      <p className="home-card__text">You’ll be the host and get a code to share.</p>
      <form aria-labelledby={headingId} onSubmit={handleSubmit} noValidate>
        <Input
          label="Your name"
          hint="1–20 characters. Other players will see it."
          name="displayName"
          autoComplete="nickname"
          value={name}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
          }}
        />
        {formError && <ErrorMessage title="Couldn’t create the room" message={formError} />}
        <Button
          type="submit"
          variant={secondary ? 'secondary' : 'primary'}
          fullWidth
          isLoading={pending}
          loadingText="Creating room…"
        >
          Create room
        </Button>
      </form>
    </section>
  )
}

interface JoinRoomFormProps {
  prefilledCode: string
  onJoined: (membership: RoomMembership) => void
}

function JoinRoomForm({ prefilledCode, onJoined }: JoinRoomFormProps) {
  const headingId = useId()
  const [code, setCode] = useState(prefilledCode)
  const [name, setName] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { pending, run } = useSubmit()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const validCode = validateRoomCodeInput(code)
    const validName = validateDisplayName(name)
    setCodeError(validCode.ok ? null : validCode.message)
    setNameError(validName.ok ? null : validName.message)
    if (!validCode.ok || !validName.ok) return

    void run(async () => {
      try {
        onJoined(await joinRoom({ roomCode: validCode.value, displayName: validName.value }))
      } catch (error) {
        const appError = toAppError(error)
        if (CODE_ERRORS.includes(appError.code)) setCodeError(appError.message)
        else if (NAME_ERRORS.includes(appError.code)) setNameError(appError.message)
        else setFormError(appError.message)
      }
    })
  }

  return (
    <section className="home-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Join a room</h2>
      <p className="home-card__text">Enter the code the host shared with you.</p>
      <form aria-labelledby={headingId} onSubmit={handleSubmit} noValidate>
        <Input
          label="Room code"
          hint="5 letters and numbers, like K7M2Q."
          name="roomCode"
          className="home-code-input"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          error={codeError}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            setCodeError(null)
          }}
        />
        <Input
          label="Your name"
          hint="1–20 characters. Other players will see it."
          name="displayName"
          autoComplete="nickname"
          // A shared join link already has the code, so start on the name.
          autoFocus={Boolean(prefilledCode)}
          value={name}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
          }}
        />
        {formError && <ErrorMessage title="Couldn’t join the room" message={formError} />}
        <Button type="submit" fullWidth isLoading={pending} loadingText="Joining room…">
          Join room
        </Button>
      </form>
    </section>
  )
}
