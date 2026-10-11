import {
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './roomCodes'

describe('ROOM_CODE_ALPHABET', () => {
  it('excludes the ambiguous characters 0, O, 1, I and L', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ch)
    }
  })

  it('is uppercase letters and digits with no duplicates', () => {
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/)
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length)
    expect(ROOM_CODE_ALPHABET).toHaveLength(31)
  })

  it('uses 5-character codes', () => {
    expect(ROOM_CODE_LENGTH).toBe(5)
  })
})

describe('normalizeRoomCode', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeRoomCode('abcde')).toBe('ABCDE')
  })

  it('strips spaces, tabs, newlines and dashes anywhere', () => {
    expect(normalizeRoomCode('  ab-cd e\t')).toBe('ABCDE')
    expect(normalizeRoomCode('AB\nC-D-E')).toBe('ABCDE')
  })

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(normalizeRoomCode('')).toBe('')
    expect(normalizeRoomCode('   ')).toBe('')
    expect(normalizeRoomCode(' - - ')).toBe('')
  })

  it('leaves other characters for isValidRoomCode to reject', () => {
    expect(normalizeRoomCode('ab_c.d')).toBe('AB_C.D')
  })
})

describe('isValidRoomCode', () => {
  it('accepts a code made only of alphabet characters at the right length', () => {
    expect(isValidRoomCode('ABCDE')).toBe(true)
    expect(isValidRoomCode('23456')).toBe(true)
    expect(isValidRoomCode('Z9H7K')).toBe(true)
  })

  it('accepts every alphabet character', () => {
    for (const ch of ROOM_CODE_ALPHABET) {
      expect(isValidRoomCode(ch.repeat(ROOM_CODE_LENGTH))).toBe(true)
    }
  })

  it('rejects empty input', () => {
    expect(isValidRoomCode('')).toBe(false)
  })

  it('rejects codes that are too short or too long', () => {
    expect(isValidRoomCode('ABCD')).toBe(false)
    expect(isValidRoomCode('ABCDEF')).toBe(false)
  })

  it('rejects ambiguous characters', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(isValidRoomCode(`ABCD${ch}`)).toBe(false)
    }
  })

  it('rejects lowercase and unnormalized input', () => {
    expect(isValidRoomCode('abcde')).toBe(false)
    expect(isValidRoomCode('AB-CD')).toBe(false)
    expect(isValidRoomCode(' ABCDE')).toBe(false)
  })

  it('rejects punctuation, emoji and non-Latin letters', () => {
    expect(isValidRoomCode('ABC.D')).toBe(false)
    expect(isValidRoomCode('ABCD😀')).toBe(false)
    expect(isValidRoomCode('ABCDÉ')).toBe(false)
    expect(isValidRoomCode('АВСDE')).toBe(false) // Cyrillic А, В, С
  })

  it('accepts the normalized form of messy user input', () => {
    expect(isValidRoomCode(normalizeRoomCode(' abc-de '))).toBe(true)
  })
})
