import { GAME_LIMITS } from '../types/game'
import { ERROR_MESSAGES } from './errors'
import { DISPLAY_NAME_MAX_LENGTH, validateDisplayName, validateRoomCodeInput } from './validation'

describe('validateDisplayName', () => {
  it('uses the shared contract limit', () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(GAME_LIMITS.displayNameMaxLength)
  })

  it('accepts a normal name', () => {
    expect(validateDisplayName('Wilson')).toEqual({ ok: true, value: 'Wilson' })
  })

  it('trims surrounding whitespace and returns the trimmed value', () => {
    expect(validateDisplayName('  Ada Lovelace \t')).toEqual({ ok: true, value: 'Ada Lovelace' })
  })

  it('keeps inner spaces', () => {
    expect(validateDisplayName('Mary  Jane')).toEqual({ ok: true, value: 'Mary  Jane' })
  })

  it('preserves case', () => {
    expect(validateDisplayName('lowercase')).toEqual({ ok: true, value: 'lowercase' })
  })

  it.each(['', '   ', '\t\n', ' 　'])('rejects empty or whitespace-only %j', (input) => {
    expect(validateDisplayName(input)).toMatchObject({
      ok: false,
      code: 'NAME_INVALID',
      reason: 'empty',
    })
  })

  it('accepts a name of exactly the max length', () => {
    const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH)
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name })
  })

  it('rejects a name one over the max length', () => {
    expect(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      code: 'NAME_INVALID',
      reason: 'too_long',
    })
  })

  it('checks length after trimming', () => {
    const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH)
    expect(validateDisplayName(`   ${name}   `)).toEqual({ ok: true, value: name })
  })

  it('accepts emoji and non-Latin scripts', () => {
    expect(validateDisplayName('😀 Zoë')).toEqual({ ok: true, value: '😀 Zoë' })
    expect(validateDisplayName('李小龙')).toEqual({ ok: true, value: '李小龙' })
    expect(validateDisplayName('محمد')).toEqual({ ok: true, value: 'محمد' })
    expect(validateDisplayName('👨‍👩‍👧')).toEqual({ ok: true, value: '👨‍👩‍👧' })
  })

  it('counts code points, not UTF-16 units, to match Postgres char_length', () => {
    // Each 😀 is 2 UTF-16 units but 1 code point.
    expect(validateDisplayName('😀'.repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true)
    expect(validateDisplayName('😀'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'too_long',
    })
  })

  it('normalizes to NFC so a decomposed accent counts as one character', () => {
    const decomposed = 'é'.repeat(DISPLAY_NAME_MAX_LENGTH) // e + combining acute
    const result = validateDisplayName(decomposed)
    expect(result).toEqual({ ok: true, value: 'é'.repeat(DISPLAY_NAME_MAX_LENGTH) })
  })

  it.each([
    ['newline', 'Bad\nName'],
    ['tab', 'Bad\tName'],
    ['NUL', 'Bad\u0000Name'],
    ['escape', 'Bad\u001bName'],
    ['DEL', 'Bad\u007fName'],
    ['C1 control', 'Bad\u0085Name'],
    ['line separator', 'Bad Name'],
    ['paragraph separator', 'Bad Name'],
  ])('rejects an inner %s character', (_label, input) => {
    expect(validateDisplayName(input)).toMatchObject({
      ok: false,
      code: 'NAME_INVALID',
      reason: 'invalid_characters',
    })
  })

  it('uses a known error code and a user-facing message on every failure', () => {
    for (const input of ['', 'x'.repeat(50), 'a\nb']) {
      const result = validateDisplayName(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code in ERROR_MESSAGES).toBe(true)
        expect(result.message).toMatch(/\S/)
      }
    }
  })
})

describe('validateRoomCodeInput', () => {
  it('normalizes lowercase, spaces and dashes and returns the code', () => {
    expect(validateRoomCodeInput(' abc-de ')).toEqual({ ok: true, value: 'ABCDE' })
  })

  it.each(['', '   ', '--'])('rejects empty input %j', (input) => {
    expect(validateRoomCodeInput(input)).toMatchObject({
      ok: false,
      code: 'INVALID_ROOM_CODE',
      reason: 'empty',
    })
  })

  it('uses a known error code and a user-facing message on every failure', () => {
    for (const input of ['', 'ABCD', 'ABCD0']) {
      const result = validateRoomCodeInput(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code in ERROR_MESSAGES).toBe(true)
        expect(result.message).toMatch(/\S/)
      }
    }
  })

  it('rejects codes of the wrong length', () => {
    expect(validateRoomCodeInput('ABCD')).toMatchObject({ ok: false, reason: 'wrong_length' })
    expect(validateRoomCodeInput('ABCDEF')).toMatchObject({ ok: false, reason: 'wrong_length' })
  })

  it('counts an emoji as one character when checking length', () => {
    expect(validateRoomCodeInput('ABCD😀')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
  })

  it('rejects ambiguous characters', () => {
    expect(validateRoomCodeInput('ABCD0')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
    expect(validateRoomCodeInput('abcdl')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
  })
})
