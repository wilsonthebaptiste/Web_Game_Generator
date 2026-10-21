import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

/**
 * Join errors where this code can never work for this browser. The join form is replaced by an
 * explanation and a link home, instead of an error next to a form that would only fail again.
 * (A browser that already joined never sees these: `join_room` lets it back in.)
 */
const DEAD_END_ERRORS = {
  ROOM_FINISHED: {
    title: 'This game has ended',
    text: 'New players can’t join a finished game. Ask the host for a new room code, or create a room of your own.',
  },
  ROOM_EXPIRED: {
    title: 'This room has expired',
    text: 'This room is no longer open. Ask the host for a new room code, or create a room of your own.',
  },
  ROOM_NOT_JOINABLE: {
    title: 'This game has already started',
    text: 'New players can’t join a game in progress. Ask the host for a new room code, or create a room of your own.',
  },
} as const satisfies Partial<Record<AppErrorCode, { title: string; text: string }>>

type DeadEndCode = keyof typeof DEAD_END_ERRORS

function isDeadEnd(code: AppErrorCode): code is DeadEndCode {
  return code in DEAD_END_ERRORS
}

function subscribeToOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** `navigator.onLine`, kept current. Room pages have their own banner (RoomPage). */
function useIsOnline() {
  return useSyncExternalStore(subscribeToOnline, () => navigator.onLine)
}

/** Moves keyboard focus to a form field by its `name`, so the player lands on what to fix. */
function focusField(form: RefObject<HTMLFormElement | null>, name: string) {
  const field = form.current?.elements.namedItem(name)
  if (field instanceof HTMLInputElement) field.focus()
}

/** Rendered for `/` and `/join/:code` (code prefilled). */
export function HomePage() {
  const { code } = useParams<{ code?: string }>()
  // `/` and `/join/:code` render the same component, so reset the forms when the code changes.
  return <HomeContent key={code ?? ''} prefilledCode={code ? normalizeRoomCode(code) : ''} />
}

function HomeContent({ prefilledCode }: { prefilledCode: string }) {
  const navigate = useNavigate()
  const online = useIsOnline()
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
      {/* Always rendered, so screen readers announce the change when the network drops. */}
      <p className="home-offline" role="status">
        {!online && 'You’re offline. Creating or joining a room needs a connection.'}
      </p>
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
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const validName = validateDisplayName(name)
    if (!validName.ok) {
      setNameError(validName.message)
      focusField(formRef, 'displayName')
      return
    }
    setNameError(null)

    void run(async () => {
      try {
        onCreated(await createRoom({ displayName: validName.value }))
      } catch (error) {
        const appError = toAppError(error)
        if (NAME_ERRORS.includes(appError.code)) {
          setNameError(appError.message)
          focusField(formRef, 'displayName')
        } else {
          setFormError(appError.message)
        }
      }
    })
  }

  return (
    <section className="home-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Create a room</h2>
      <p className="home-card__text">You’ll be the host and get a code to share.</p>
      <form ref={formRef} aria-labelledby={headingId} onSubmit={handleSubmit} noValidate>
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
  const [deadEnd, setDeadEnd] = useState<DeadEndCode | null>(null)
  const { pending, run } = useSubmit()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const validCode = validateRoomCodeInput(code)
    const validName = validateDisplayName(name)
    setCodeError(validCode.ok ? null : validCode.message)
    setNameError(validName.ok ? null : validName.message)
    if (!validCode.ok || !validName.ok) {
      focusField(formRef, validCode.ok ? 'displayName' : 'roomCode')
      return
    }

    void run(async () => {
      try {
        onJoined(await joinRoom({ roomCode: validCode.value, displayName: validName.value }))
      } catch (error) {
        const appError = toAppError(error)
        if (isDeadEnd(appError.code)) {
          setDeadEnd(appError.code)
        } else if (CODE_ERRORS.includes(appError.code)) {
          setCodeError(appError.message)
          focusField(formRef, 'roomCode')
        } else if (NAME_ERRORS.includes(appError.code)) {
          setNameError(appError.message)
          focusField(formRef, 'displayName')
        } else {
          setFormError(appError.message)
        }
      }
    })
  }

  // After "start over", put the player straight into the emptied code field.
  const focusCodeOnReturn = useRef(false)
  useEffect(() => {
    if (deadEnd === null && focusCodeOnReturn.current) {
      focusCodeOnReturn.current = false
      focusField(formRef, 'roomCode')
    }
  }, [deadEnd])

  /** Back to an empty join form. On `/join/:code` the link also navigates home. */
  function startOver() {
    focusCodeOnReturn.current = true
    setDeadEnd(null)
    setCode('')
    setCodeError(null)
  }

  if (deadEnd) {
    return (
      <section className="home-card" aria-labelledby={headingId}>
        <h2 id={headingId}>Join a room</h2>
        <DeadEndNotice code={deadEnd} onStartOver={startOver} />
      </section>
    )
  }

  return (
    <section className="home-card" aria-labelledby={headingId}>
      <h2 id={headingId}>Join a room</h2>
      <p className="home-card__text">Enter the code the host shared with you.</p>
      <form ref={formRef} aria-labelledby={headingId} onSubmit={handleSubmit} noValidate>
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

interface DeadEndNoticeProps {
  code: DeadEndCode
  onStartOver: () => void
}

/**
 * Replaces the join form when the room can't be joined. Takes focus when it appears, because
 * the button that had focus is gone; its heading and text are read out together.
 */
function DeadEndNotice({ code, onStartOver }: DeadEndNoticeProps) {
  const titleId = useId()
  const textId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const { title, text } = DEAD_END_ERRORS[code]

  useEffect(() => ref.current?.focus(), [])

  return (
    <div
      ref={ref}
      className="home-dead-end"
      role="group"
      aria-labelledby={titleId}
      aria-describedby={textId}
      tabIndex={-1}
    >
      <h3 id={titleId} className="home-dead-end__title">
        {title}
      </h3>
      <p id={textId} className="home-dead-end__text">
        {text}
      </p>
      <Link to="/" className="ui-button ui-button--secondary ui-button--full" onClick={onStartOver}>
        Go to the home page
      </Link>
    </div>
  )
}
