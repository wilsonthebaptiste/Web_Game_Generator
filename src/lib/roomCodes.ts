/**
 * Room code format. The `create_room` SQL function must generate codes from this exact
 * alphabet and length; change both together.
 *
 * Uppercase letters and digits minus the look-alikes 0/O, 1/I/L, so a code read aloud or
 * off a screen across the room can't be mistyped.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

/** Uppercases and strips whitespace and dashes, so "ab-c d e" becomes "ABCDE". */
export function normalizeRoomCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/** True only for an already-normalized code of the right length and alphabet. */
export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code)
}
