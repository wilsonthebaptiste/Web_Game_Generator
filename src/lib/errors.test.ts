import { ERROR_MESSAGES, createAppError, getErrorMessage, isAppError, toAppError } from './errors'

describe('createAppError', () => {
  it('builds an Error with the code and friendly message', () => {
    const error = createAppError('NAME_TAKEN')
    expect(error).toBeInstanceOf(Error)
    expect(isAppError(error)).toBe(true)
    expect(error.code).toBe('NAME_TAKEN')
    expect(error.message).toBe(ERROR_MESSAGES.NAME_TAKEN)
  })
})

describe('toAppError', () => {
  it('returns an AppError unchanged', () => {
    const error = createAppError('NOT_HOST')
    expect(toAppError(error)).toBe(error)
  })

  it('maps an RPC exception message to its code', () => {
    const rpcError = { message: 'ROOM_EXPIRED', code: 'P0001', details: null, hint: null }
    const error = toAppError(rpcError)
    expect(error.code).toBe('ROOM_EXPIRED')
    expect(error.message).toBe(ERROR_MESSAGES.ROOM_EXPIRED)
    expect(error.cause).toBe(rpcError)
  })

  it('maps an RPC code followed by detail', () => {
    expect(toAppError({ message: 'INVALID_ANSWER: text too long' }).code).toBe('INVALID_ANSWER')
  })

  it.each([
    [{ name: 'AuthRetryableFetchError', message: 'fetch failed' }, 'NETWORK_ERROR'],
    [new TypeError('Failed to fetch'), 'NETWORK_ERROR'],
    [{ message: 'too many requests', status: 429 }, 'RATE_LIMITED'],
    [{ message: 'JWT expired', status: 401 }, 'NOT_AUTHENTICATED'],
    [{ message: 'upstream timeout', status: 503 }, 'SERVICE_UNAVAILABLE'],
  ] as const)('maps %o to %s', (input, code) => {
    expect(toAppError(input).code).toBe(code)
  })

  it('never exposes a raw database message', () => {
    const error = toAppError({
      message: 'duplicate key value violates unique constraint "players_room_id_name_key"',
    })
    expect(error.code).toBe('UNKNOWN')
    expect(error.message).toBe(ERROR_MESSAGES.UNKNOWN)
  })

  it.each([null, undefined, 42, 'oops'])('handles a non-error value: %o', (value) => {
    expect(toAppError(value).code).toBe('UNKNOWN')
  })
})

describe('getErrorMessage', () => {
  it('returns the friendly message', () => {
    expect(getErrorMessage({ message: 'NOT_HOST' })).toBe(ERROR_MESSAGES.NOT_HOST)
  })
})

describe('ERROR_MESSAGES', () => {
  it('has a non-empty message for every code', () => {
    for (const message of Object.values(ERROR_MESSAGES)) {
      expect(message.trim()).not.toBe('')
    }
  })
})
