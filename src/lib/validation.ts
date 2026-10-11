import { GAME_LIMITS, type AppErrorCode } from '../types/game'
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from './roomCodes'

/**
 * Display names are 1–20 characters after trimming (`GAME_LIMITS`). Length counts Unicode
 * code points, to match Postgres `char_length`, so the server check agrees with this one.
 * Control characters (newlines, tabs, NUL, ...) and line/paragraph separators are rejected;
 * emoji and non-Latin scripts are allowed.
 */
export const DISPLAY_NAME_MAX_LENGTH = GAME_LIMITS.displayNameMaxLength

export type DisplayNameIssue = 'empty' | 'too_long' | 'invalid_characters'

export type DisplayNameResult =
  | { ok: true; value: string }
  | {
      ok: false
      code: Extract<AppErrorCode, 'INVALID_DISPLAY_NAME'>
      reason: DisplayNameIssue
      message: string
    }

const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/u

/** Validates a display name. On success, `value` is the trimmed, NFC-normalized name to send. */
export function validateDisplayName(name: string): DisplayNameResult {
  const value = name.normalize('NFC').trim()

  if ([...value].length < GAME_LIMITS.displayNameMinLength) {
    return nameError('empty', 'Enter a display name.')
  }
  if (FORBIDDEN_NAME_CHARS.test(value)) {
    return nameError('invalid_characters', 'Display name can’t contain line breaks or tabs.')
  }
  if ([...value].length > DISPLAY_NAME_MAX_LENGTH) {
    return nameError(
      'too_long',
      `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    )
  }
  return { ok: true, value }
}

function nameError(reason: DisplayNameIssue, message: string): DisplayNameResult {
  return { ok: false, code: 'INVALID_DISPLAY_NAME', reason, message }
}

export type RoomCodeIssue = 'empty' | 'wrong_length' | 'invalid_characters'

export type RoomCodeResult =
  | { ok: true; value: string }
  | {
      ok: false
      code: Extract<AppErrorCode, 'INVALID_ROOM_CODE'>
      reason: RoomCodeIssue
      message: string
    }

/**
 * Validates what a user typed into the room code field. On success, `value` is the
 * normalized code. This only checks the format; whether the room exists is the server's job.
 */
export function validateRoomCodeInput(input: string): RoomCodeResult {
  const value = normalizeRoomCode(input)

  if (value.length === 0) {
    return roomCodeError('empty', 'Enter a room code.')
  }
  if ([...value].length !== ROOM_CODE_LENGTH) {
    return roomCodeError('wrong_length', `Room codes are ${ROOM_CODE_LENGTH} characters.`)
  }
  if (!isValidRoomCode(value)) {
    return roomCodeError(
      'invalid_characters',
      'That isn’t a valid room code. Check it and try again.',
    )
  }
  return { ok: true, value }
}

function roomCodeError(reason: RoomCodeIssue, message: string): RoomCodeResult {
  return { ok: false, code: 'INVALID_ROOM_CODE', reason, message }
}
