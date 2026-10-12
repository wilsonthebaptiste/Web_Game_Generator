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

- **Projects:** `party-game-dev` (ref `nlpqfmsijyeyhfvssain`) and `party-game-prod`
  (ref `defxqdxgrwnwfhjtsaya`), both in us-west-2. Refs aren't secret. The Project URL is always
  `https://<ref>.supabase.co`. Ask Contributor C for the `dev` publishable key for your `.env`.
- **Copy the whole publishable key,** including the `sb_publishable_` prefix. Without the prefix
  Supabase answers "Invalid API key". Never use a `sb_secret_` or `service_role` key in the app.
- **New projects have anonymous sign-ins turned off.** Turn them on under Authentication →
  Sign In / Providers, or nobody can create or join a room.
- **Anonymous users have the `authenticated` role, not `anon`.** RLS policies and grants target
  `authenticated`. The `anon` role (no session at all) gets nothing.
- **Clients can only read.** The initial migration revokes every table privilege from `anon`
  and `authenticated`, then grants SELECT on `rooms`, `players`, `rounds`, and `answers` only.
  It also changes default privileges, so **a table added by a later migration has no client
  access until that migration grants it.**
- **New functions are callable by everyone by default.** Supabase grants EXECUTE on new
  functions to `anon` and `authenticated`. Every RPC migration must
  `revoke execute on function ... from public, anon` and grant only to `authenticated`.
- **Helpers live in the `private` schema.** It isn't exposed through the Data API, so functions
  like `private.is_room_member()` can be used in RLS policies but can't be called as RPCs.
- **Display names are checked by the database too.** The `players` table rejects names that
  aren't 1–20 code points, trimmed, NFC-normalized, and free of control characters. This matches
  `validateDisplayName`, so always send its `value` (trimmed and normalized), not the raw input.
- **Room codes are checked by the database too:** 5 characters from `ROOM_CODE_ALPHABET`.
  If `src/lib/roomCodes.ts` ever changes, the SQL needs a new migration in the same release.
- **`src/types/database.ts` is generated.** Never edit it by hand. Contributor C runs
  `npm run db:types` after each migration. `getSupabase()` is typed with it, so table and column
  names are checked by TypeScript.
- **No GitHub integration needed.** Supabase's "connect GitHub repo" option is for Branching
  (paid) and needs repo admin. We apply migrations with the CLI instead: `npx supabase login`
  once, `npx supabase link --project-ref <ref>`, then `npx supabase db push`. Linking and pushing
  only need the Supabase login, not the database password.
- **Docker isn't installed on Contributor C's machine yet,** so `npm run test:db` can't run
  locally. The initial migration was verified with PGlite (Postgres in Node) plus live checks on
  `dev` as an anonymous user. Docker Desktop is needed before the RPC parity tests in Phase 3.

- **The client is created lazily.** `getSupabase()` builds the client on first use and throws a
  `CONFIG_MISSING` AppError if `.env` is missing. That's why pages and tests work without `.env`.
- **Anonymous sign-in runs once.** React StrictMode runs effects twice in development, which
  could create two anonymous users. `ensureAnonymousSession()` shares one in-flight sign-in
  between concurrent callers to prevent that.
- **Anonymous sign-ins must be enabled** in each Supabase project (Authentication → Sign In /
  Providers). Without it, sign-in fails.

## Calling the RPCs

- **Argument names are snake_case, results are camelCase.** Call
  `getSupabase().rpc('create_room', { display_name })`,
  `rpc('join_room', { code, display_name })`, and `rpc('get_room_snapshot', { code })`. Each
  returns jsonb already shaped like `RoomMembership` or `RoomSnapshot` from
  `src/types/game.ts`. The generated types say `Json`, so cast:
  `data as unknown as RoomMembership`. Don't remap fields.
- **Errors arrive in `error.message`** as the bare code (`NAME_TAKEN`, `ROOM_NOT_FOUND`, ...).
  Pass the error **and the response's HTTP status** to `toAppError`:
  `const { data, error, status } = await getSupabase().rpc(...)`, then
  `if (error) throw toAppError(error, status)`. supabase-js puts the status on the response, not
  on the error, so without it a real 429 or 5xx shows as "Something went wrong". A call with no
  session (Postgres `42501`) or an expired token (`PGRST301`) becomes `NOT_AUTHENTICATED`, but
  always call `ensureAnonymousSession()` first.
- **The server cleans input the same way the client does.** Codes are normalized like
  `normalizeRoomCode` and names like `validateDisplayName` (NFC, then JS-style trim). The two
  were checked against each other on 27 tricky names and 17 codes and agree on every one.
- **`get_room_snapshot` refuses non-members** with `NOT_A_MEMBER` instead of returning
  `me: null`, so a room's player list is never visible before joining. RoomPage sends
  `NOT_A_MEMBER` to `/join/:code`.
- **Rejoin is automatic.** `join_room` from a browser that's already in the room returns its
  existing player (and ignores the new name), even after the game has started or ended. New
  players get `ROOM_NOT_JOINABLE` ("already started") while a game is in progress and
  `ROOM_FINISHED` ("This game has ended") once it's over. Expired rooms give `ROOM_EXPIRED` to
  everyone.
- **Rate limits:** 5 rooms created and 20 new rooms joined per browser per hour, counted from the
  rows those calls create. **Known gap:** failed attempts (wrong codes) can't be counted, because
  a raised error rolls back everything the call wrote. Guessing codes is slowed only by the
  28.6 million possible codes, 12-hour expiry, and Supabase's limit of 30 anonymous sign-ins per
  hour per IP.

- **Rounds:** `rpc('start_round', { room_id, mode })` returns the new `Round`;
  `rpc('submit_answer', { round_id, payload })` returns nothing. Calling `submit_answer` again
  replaces the player's answer until the reveal (there's no separate edit call). The server keeps
  only the mode's field, trims word guesses, and updates `submissionCount`. Errors:
  `NOT_HOST`, `INVALID_MODE`, `NOT_ENOUGH_PLAYERS`, `ROUND_IN_PROGRESS`, `ROUND_LIMIT_REACHED`,
  `NO_CONTENT_AVAILABLE`, `ROOM_FINISHED`, `ROUND_NOT_FOUND`, `ROUND_NOT_ANSWERING`,
  `INVALID_ANSWER`, `SELF_VOTE_NOT_ALLOWED`.
- **Server and client answer checks agree.** `submit_answer` was run side by side with
  `validateAnswerPayload` on 27 payloads across all three modes, with identical results. One
  harmless difference: the client counts word-guess length in UTF-16 units and the server in
  code points, so the server is slightly more lenient with emoji, never stricter. Using
  `[...text].length` in `validatePayload.ts` would make them identical.
- **`normalize.ts` says the SQL uses `lower(btrim(text))`,** but `btrim` only strips ASCII
  spaces. `reveal_round` will trim with the same JS whitespace set as everywhere else, then
  lowercase, so it matches `normalizeAnswer`.

## Content workflow

1. Contributor B edits `src/content/*.ts` and merges the PR, then tells Contributor C.
2. Contributor C runs `npm run content:sync`. It writes a new
   `supabase/migrations/<timestamp>_content_sync.sql`, or prints "Content unchanged" and writes
   nothing.
3. C reviews the file, commits it, and applies it with `npx supabase db push`.

The migration upserts every item. Items deleted from `src/content/` are marked `active = false`
rather than deleted, because old rounds still reference them, and they're never picked again.
Changing an item's text changes it for future rounds only; rounds already played keep their
snapshot. Never reuse an old ID for a different question.

## Tooling and versions

- **Avoid backticks in shell one-liners that edit files.** In Git Bash, backticks inside
  double-quoted `node -e "..."` scripts run as command substitution and silently corrupt the
  replacement. Edit Markdown and code with the editor, or put the script in a file.

- **PL/pgSQL parameter names can clash with column names.** For example,
  `on conflict (round_id, player_id)` inside a function with a `round_id` parameter fails as
  ambiguous. Qualify columns with a table alias, refer to parameters as `function_name.param`,
  and use `on conflict on constraint <name>`.

- **JavaScript and Postgres disagree on whitespace.** JS `trim()` and `\s` remove Unicode spaces
  (NBSP, U+3000, U+FEFF, line separators). Postgres `btrim()` and `\s` only handle ASCII. The SQL
  spells out the JS whitespace set in `private.js_whitespace_class()`.
- **Database tests run against any Supabase instance.** Set `SUPABASE_TEST_URL` and
  `SUPABASE_TEST_ANON_KEY` (for `dev`, the same values as in `.env`), then `npm run test:db`.
  Each run signs in about 4 anonymous users and leaves a few test rooms that expire in 12 hours.
- **`tsconfig.node.json` uses bundler module resolution**, like the app, because Vitest bundles
  the test files. Imports there don't need `.js` extensions.

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

- **Check that a PR is still open before pushing a fix to its branch.** Commits pushed to a
  branch after its PR merged go nowhere. Put the fix on a new branch from `main` instead (this
  happened with the `NAME_INVALID` rename, which became PR #3).

- **Branch protection on a private repo needs a paid GitHub plan.** The repo was made public
  so protection is free. That makes the "no secrets in Git" rule even more important.
- **The required `check` status only appears** in branch protection settings after CI has run
  at least once.
- **Use "Squash and merge".** PR #1 was merged with a regular merge commit by mistake. Wilson
  can make squash the only option in Settings → General → Pull Requests.
- **After a PR merges,** delete the branch on GitHub (button on the PR page) and locally with
  `git branch -d <branch>`.
