# Development Notes

Things we learned while building that aren't obvious from the code. Maintained by Contributor C.
Add a note in your own PR if you hit something the rest of the team should know.

Newest entries go at the top of each section.

## Conventions to follow

- **The plans are the source of truth for names.** When the contract and a contributor plan
  disagree, the original plan wins. For example, the invalid-name error code is `NAME_INVALID`
  (Wilson's plan), and room codes are 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (no `0 O 1 I L`), uppercased with spaces and dashes removed. The SQL copies the alphabet from
  `src/lib/roomCodes.ts` exactly.

- **Formatting:** Prettier with no semicolons, single quotes, and a print width of 100
  (`.prettierrc.json`). Run `npm run format` before committing. ESLint doesn't enforce formatting.
- **Line endings:** `.gitattributes` keeps every file LF. On Windows you may see
  "CRLF will be replaced by LF" warnings when staging. They're expected and harmless.
- **Unused parameters:** prefix them with `_` (e.g. `_roomId`). ESLint and TypeScript both
  ignore underscore-prefixed names. The scaffold stubs use this. Drop the underscore when you
  implement the function.
- **Errors:** services catch everything and `throw toAppError(error)` from `src/lib/errors.ts`.
  Show `error.message` to players; it's always friendly. Never show a raw Supabase or Postgres
  message.
- **RPC error convention:** RPCs signal expected failures with `raise exception 'NAME_TAKEN'`
  or `raise exception 'INVALID_ANSWER: text too long'`. `toAppError` reads the code before the
  colon. A new code must be added to `AppErrorCode` and `ERROR_MESSAGES` first (a contract change).
- **Room views:** `LobbyPage`, `GamePage`, and `FinalScreen` receive one `session: RoomSession`
  prop. `session.me` is never null (non-members are redirected), and `session.isHost` is
  precomputed. Call `session.refresh()` after your own action succeeds if you need the new state
  immediately instead of waiting for realtime.
- **Content imports:** ESLint fails any import of `src/content` from app code, because content
  holds the answers. Prompts reach the UI only through `round.promptSnapshot`.

## Testing

- **Fixtures:** `src/test/fixtures.ts` has a session for every state (lobby, answering per
  mode with and without an answer, revealed per mode, finished with and without a tie). Use
  `viewAs(session, playerId)` to see the same state as another player, e.g. the host. Don't
  mutate fixtures in a test; spread them into a new object instead, because they're shared.
- **Mocking modules in Vitest:** `vi.mock()` is hoisted above your imports and `const`s, so a
  mock factory can't use a variable declared normally in the file. Declare mocks with
  `vi.hoisted(() => ...)` (see `src/lib/supabaseClient.test.ts`).
- **Module-level state:** to test a module that caches something at the top level (like the
  Supabase client), call `vi.resetModules()` and `await import(...)` it fresh in each test.
- **Env vars in tests:** use `vi.stubEnv('VITE_...', value)` and `vi.unstubAllEnvs()` in
  `afterEach`.
- **`npm run test:db`** runs `tests/integration/` against local Supabase and needs Docker. It
  passes with no tests, so it's safe to run before the database tests exist.

## Supabase

- **The client is created lazily.** `getSupabase()` builds the client on first use and throws a
  `CONFIG_MISSING` AppError if `.env` is missing. That's why pages and tests work without `.env`.
- **Anonymous sign-in runs once.** React StrictMode runs effects twice in development, which
  could create two anonymous users. `ensureAnonymousSession()` shares one in-flight sign-in
  between concurrent callers to prevent that.
- **Anonymous sign-ins must be enabled** in each Supabase project (Authentication → Sign In /
  Providers). Without it, sign-in fails.

## Tooling and versions

- **Current stack:** Node 24, Vite 8, React 19, TypeScript 6, Vitest 5, ESLint 10. Use
  `nvm use` to pick up `.nvmrc`.
- **The Vite React template now uses oxlint.** The plan calls for ESLint, so we set up ESLint
  ourselves (`eslint.config.js`). Don't add oxlint.
- **`eslint-plugin-jsx-a11y` doesn't support ESLint 10 yet**, so it's not installed. Until it
  is, check accessibility by hand: labels on every input, visible focus, and status shown with
  text or icons, not only color.
- **`no-restricted-imports` uses a regex** (`(^|/)content(/|$)`) so it matches relative
  imports at any depth (`../../content/trivia`, `../../content`). It was checked with throwaway
  files: imports from a feature folder fail, while `src/content/` itself and `scripts/` pass.

## GitHub and workflow

- **Branch protection on a private repo needs a paid GitHub plan.** The repo was made public
  so protection is free. That makes the "no secrets in Git" rule even more important.
- **The required `check` status only appears** in branch protection settings after CI has run
  at least once.
- **Use "Squash and merge".** PR #1 was merged with a regular merge commit by mistake. Wilson
  can make squash the only option in Settings → General → Pull Requests.
- **After a PR merges,** delete the branch on GitHub (button on the PR page) and locally with
  `git branch -d <branch>`.
