import { GAME_LIMITS, type AppError, type AppErrorCode } from '../types/game'

/** Player-facing text for every error code. Keep these short, friendly, and free of internals. */
export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  NAME_INVALID: `Names must be ${GAME_LIMITS.displayNameMinLength}–${GAME_LIMITS.displayNameMaxLength} characters, without line breaks or tabs.`,
  INVALID_ROOM_CODE: "That doesn't look like a room code. Check it and try again.",
  INVALID_MODE: "That game mode isn't available.",
  INVALID_ANSWER: "That answer isn't valid. Check it and try again.",
  SELF_VOTE_NOT_ALLOWED: "You can't vote for yourself in this round.",
  ROOM_NOT_FOUND: "We couldn't find a room with that code.",
  ROOM_EXPIRED: 'This room has expired. Start a new room to keep playing.',
  ROOM_NOT_JOINABLE: 'This game has already started, so new players can’t join.',
  ROOM_FINISHED: 'This game has ended.',
  NAME_TAKEN: 'Someone in this room already has that name. Try another one.',
  NOT_A_MEMBER: "You're not in this room yet. Join it with a name first.",
  NOT_HOST: 'Only the host can do that.',
  NOT_ENOUGH_PLAYERS: 'You need at least 2 players to start.',
  ROUND_LIMIT_REACHED: 'You’ve played all the rounds for this game.',
  ROUND_IN_PROGRESS: 'Reveal the current round before starting the next one.',
  ROUND_NOT_FOUND: "We couldn't find that round.",
  ROUND_NOT_ANSWERING: 'Answers are locked for this round.',
  ROUND_ALREADY_REVEALED: 'This round has already been revealed.',
  NO_CONTENT_AVAILABLE: 'There are no more prompts for this mode. Try a different mode.',
  NOT_AUTHENTICATED: 'Your session has expired. Refresh the page to continue.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
  CODE_GENERATION_FAILED: "We couldn't create a room right now. Please try again.",
  NETWORK_ERROR: "You're offline or the connection dropped. Check your network and try again.",
  SERVICE_UNAVAILABLE: 'The game server is busy or unavailable. Please try again shortly.',
  CONFIG_MISSING:
    'The app is not configured. Copy .env.example to .env and fill in the Supabase dev project values.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

const ERROR_CODES = new Set(Object.keys(ERROR_MESSAGES))

function isAppErrorCode(value: string): value is AppErrorCode {
  return ERROR_CODES.has(value)
}

export function createAppError(code: AppErrorCode, cause?: unknown): AppError {
  const error = new Error(ERROR_MESSAGES[code], { cause }) as AppError
  error.name = 'AppError'
  error.code = code
  return error
}

export function isAppError(value: unknown): value is AppError {
  return (
    value instanceof Error &&
    value.name === 'AppError' &&
    typeof (value as Partial<AppError>).code === 'string'
  )
}

/**
 * Converts anything a service catches into an AppError with a friendly message.
 * The original error is kept as `cause` for debugging but never shown to players.
 *
 * RPCs signal expected failures with `raise exception '<CODE>'`; supabase-js surfaces that as
 * an error whose `message` is the code (optionally followed by `: detail`).
 *
 * supabase-js puts the HTTP status on the response, not on the error, so pass it along:
 *   const { data, error, status } = await getSupabase().rpc(...)
 *   if (error) throw toAppError(error, status)
 */
export function toAppError(error: unknown, httpStatus?: number): AppError {
  if (isAppError(error)) return error

  const described = describe(error)
  const { message = '', name = '', code = '' } = described
  const status = httpStatus ?? described.status

  const rpcCode = message.split(':', 1)[0].trim()
  if (isAppErrorCode(rpcCode)) return createAppError(rpcCode, error)

  if (status === 429) return createAppError('RATE_LIMITED', error)
  // 42501: called without a session (the anon role has no access). PGRST301: expired JWT.
  if (
    status === 401 ||
    name === 'AuthSessionMissingError' ||
    code === '42501' ||
    code === 'PGRST301'
  ) {
    return createAppError('NOT_AUTHENTICATED', error)
  }
  if (typeof status === 'number' && status >= 500) {
    return createAppError('SERVICE_UNAVAILABLE', error)
  }
  if (
    name === 'AuthRetryableFetchError' ||
    name === 'FunctionsFetchError' ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  ) {
    return createAppError('NETWORK_ERROR', error)
  }

  return createAppError('UNKNOWN', error)
}

/** Friendly message for any thrown value. */
export function getErrorMessage(error: unknown, httpStatus?: number): string {
  return toAppError(error, httpStatus).message
}

function describe(error: unknown): {
  message?: string
  name?: string
  code?: string
  status?: number
} {
  if (typeof error === 'string') return { message: error }
  if (typeof error !== 'object' || error === null) return {}
  const record = error as Record<string, unknown>
  return {
    message: typeof record.message === 'string' ? record.message : undefined,
    name: typeof record.name === 'string' ? record.name : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    status: typeof record.status === 'number' ? record.status : undefined,
  }
}
