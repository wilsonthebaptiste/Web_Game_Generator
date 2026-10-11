import { normalizeAnswer } from './normalize'
import { validateAnswerPayload, type ValidationContext } from './validatePayload'

const ctx: ValidationContext = {
  myPlayerId: 'me',
  playerIds: ['me', 'p2', 'p3'],
  choiceIds: ['a', 'b', 'c', 'd'],
}

describe('normalizeAnswer', () => {
  it.each([
    ['banana', 'banana'],
    ['  Banana  ', 'banana'],
    ['\tICE CREAM\n', 'ice cream'],
    ['ice  cream', 'ice  cream'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected)
  })
})

describe('validateAnswerPayload', () => {
  it.each([null, undefined, 'b', 42, ['b']])('rejects a non-object payload (%j)', (payload) => {
    const result = validateAnswerPayload('trivia', payload, ctx)
    expect(result).toMatchObject({ ok: false, code: 'INVALID_ANSWER' })
  })

  describe('trivia', () => {
    it('accepts a listed choice and strips extra fields', () => {
      expect(validateAnswerPayload('trivia', { choiceId: 'b', points: 99 }, ctx)).toEqual({
        ok: true,
        value: { choiceId: 'b' },
      })
    })

    it.each([{}, { choiceId: '' }, { choiceId: 1 }, { choiceId: 'z' }])('rejects %j', (payload) => {
      expect(validateAnswerPayload('trivia', payload, ctx).ok).toBe(false)
    })

    it('accepts any non-empty choice when choiceIds are not given', () => {
      const result = validateAnswerPayload(
        'trivia',
        { choiceId: 'z' },
        { ...ctx, choiceIds: undefined },
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('word-guessing', () => {
    it('trims the guess', () => {
      expect(validateAnswerPayload('word-guessing', { text: '  Zebra ' }, ctx)).toEqual({
        ok: true,
        value: { text: 'Zebra' },
      })
    })

    it('accepts 1 and 60 characters', () => {
      expect(validateAnswerPayload('word-guessing', { text: 'a' }, ctx).ok).toBe(true)
      expect(validateAnswerPayload('word-guessing', { text: 'a'.repeat(60) }, ctx).ok).toBe(true)
    })

    it.each([{}, { text: '' }, { text: '    ' }, { text: 5 }, { text: 'a'.repeat(61) }])(
      'rejects %j',
      (payload) => {
        expect(validateAnswerPayload('word-guessing', payload, ctx).ok).toBe(false)
      },
    )
  })

  describe('social', () => {
    it('accepts a vote for another player', () => {
      expect(validateAnswerPayload('social', { votedPlayerId: 'p2' }, ctx)).toEqual({
        ok: true,
        value: { votedPlayerId: 'p2' },
      })
    })

    it('rejects a vote for someone not in the room', () => {
      expect(validateAnswerPayload('social', { votedPlayerId: 'ghost' }, ctx).ok).toBe(false)
    })

    it('rejects a self-vote unless the prompt allows it', () => {
      expect(validateAnswerPayload('social', { votedPlayerId: 'me' }, ctx).ok).toBe(false)
      expect(
        validateAnswerPayload('social', { votedPlayerId: 'me' }, { ...ctx, allowSelfVote: true })
          .ok,
      ).toBe(true)
    })

    it.each([{}, { votedPlayerId: '' }, { votedPlayerId: 7 }])('rejects %j', (payload) => {
      expect(validateAnswerPayload('social', payload, ctx).ok).toBe(false)
    })
  })

  it('rejects an unsupported mode', () => {
    // @ts-expect-error: deliberately invalid mode
    expect(validateAnswerPayload('drawing', { text: 'x' }, ctx).ok).toBe(false)
  })
})
