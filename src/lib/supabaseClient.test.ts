const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    signInAnonymously: vi.fn(),
  }
  return { auth, createClient: vi.fn(() => ({ auth })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

// supabaseClient caches the client and in-flight sign-in at module level, so each test
// imports a fresh copy.
async function loadModule() {
  vi.resetModules()
  return import('./supabaseClient')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getSupabase', () => {
  it('throws a setup hint when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const { getSupabase } = await loadModule()
    expect(() => getSupabase()).toThrow(/\.env\.example/)
  })

  it('creates the client once', async () => {
    const { getSupabase } = await loadModule()
    expect(getSupabase()).toBe(getSupabase())
    expect(createClient).toHaveBeenCalledOnce()
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-anon-key')
  })
})

describe('ensureAnonymousSession', () => {
  it('reuses a restored session without signing in again', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    const { ensureAnonymousSession } = await loadModule()

    await expect(ensureAnonymousSession()).resolves.toBe('user-1')
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('signs in anonymously when there is no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
    const { ensureAnonymousSession } = await loadModule()

    await expect(ensureAnonymousSession()).resolves.toBe('user-2')
  })

  it('shares one sign-in between concurrent callers', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: 'user-3' } }, error: null })
    const { ensureAnonymousSession } = await loadModule()

    const ids = await Promise.all([ensureAnonymousSession(), ensureAnonymousSession()])
    expect(ids).toEqual(['user-3', 'user-3'])
    expect(auth.signInAnonymously).toHaveBeenCalledOnce()
  })

  it('rejects with the sign-in error and allows a retry', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    auth.signInAnonymously
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Anonymous sign-ins are disabled'),
      })
      .mockResolvedValueOnce({ data: { user: { id: 'user-4' } }, error: null })
    const { ensureAnonymousSession } = await loadModule()

    await expect(ensureAnonymousSession()).rejects.toThrow('Anonymous sign-ins are disabled')
    await expect(ensureAnonymousSession()).resolves.toBe('user-4')
  })
})
