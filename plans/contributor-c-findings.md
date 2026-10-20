# Contributor C project findings

Findings from Contributor C (Waliu, Integration, Data, and Delivery) while working through
[`contributor-c-waliu.md`](contributor-c-waliu.md). Newest phase at the top. General lessons
for everyone are in [`docs/dev-notes.md`](../docs/dev-notes.md); this file covers what C built,
decisions, answers to A and B, and open items.

---

## Open items

| # | Item | Raised by | Status |
|---|---|---|---|
| 1 | Fixture room code `ABCD` is 4 characters; codes are 5. | A | **Done:** now `ABCDE`, with a test that it passes `isValidRoomCode` |
| 2 | `join_room` raises `ROOM_NOT_JOINABLE` for both a started and a finished room. A wants `ROOM_FINISHED` for a finished room, for the Phase 4 "This game has ended" screen. | A | **Done:** migration `20261012234438_join_room_finished.sql` |
| 3 | `toAppError` reads `error.status`, but supabase-js puts the HTTP status on the response, not on the error, so real 429/5xx responses became `UNKNOWN`. | A | **Done:** `toAppError(error, status?)`. Services pass `status` from the response (see `docs/dev-notes.md`) |
| 4 | The `NAME_INVALID` message only mentions length. | A | **Done:** "Names must be 1–20 characters, without line breaks or tabs." |
| 9 | `useRoomSession` used a fixed rounds channel topic, `room-rounds:<roomId>`. realtime-js reuses an open topic, so a quick re-subscribe would throw. | A | **Done:** counter suffix (`fix/rounds-channel-topic`) |
| 10 | `subscribeToRoom` refetches on `SUBSCRIBED`, but database changes only start ~120 ms later ("Subscribed to PostgreSQL"). A guest joining in that gap stays invisible until the next change. `useRoomSession` now refetches on that confirmation from its rounds channel, which covers it in practice. A should also switch `subscribeToRoom` to the `system` message. | C | To do (A), see `docs/dev-notes.md` |
| 5 | Drop `getMyAnswer(roundId)` from B's plan. Use `session.myAnswer` plus `session.refresh()` after a submit. | B | Agreed by C |
| 6 | Word-guess length: the client counts UTF-16 units and the server counts code points. Harmless, because the server is only ever more lenient. `[...text].length` in `validatePayload.ts` would make them identical. | C | Optional (B) |
| 7 | Docker isn't installed on C's machine, so `npm run test:db` runs against `dev` instead of a local stack. Needed before the Phase 3 scoring parity test. | C | **Done:** Docker Desktop plus `npx supabase start`; parity test runs locally |
| 8 | Branch protection on `main`: Wilson owns the repo. | C | Waiting on A |

---

## Phase 3 — Reveal and scoring (`feat/reveal-scoring`)

### What was built

| File | Purpose |
|---|---|
| `supabase/migrations/20261016204418_reveal_and_end_game.sql` | `reveal_round`, `end_game` (applied to `dev`) |
| `tests/integration/scoring.parity.test.ts` | All 18 cases in `scoring.fixtures.json` through the real `reveal_round` (local only) |
| `tests/integration/reveal-rpcs.test.ts` | Host only, single scoring, answers locked after reveal, scores carry over, `end_game` |
| `tests/integration/helpers.ts` | `adminClient()` (localhost only) and `isLocalStack()` |
| `src/types/database.ts` | Regenerated |

Results: parity 18/18 and `test:db` 45/45 locally; `reveal-rpcs` 7/7 against `dev`.

### Decisions

- **One transaction, row lock first.** `reveal_round` locks the round with `for update`, so a
  second reveal or a late `submit_answer` waits and then sees `revealed`. Double reveal raises
  `ROUND_ALREADY_REVEALED` and changes nothing.
- **Check order:** `NOT_AUTHENTICATED`, `ROUND_NOT_FOUND`, `NOT_A_MEMBER`, `NOT_HOST`,
  `ROOM_EXPIRED`, `ROOM_FINISHED`, `ROUND_ALREADY_REVEALED`.
- **Results in join order** (`joined_at`, then id), one per player, so every client renders the
  same list. Social answers record `points_awarded = 0` on the voter; the points go to the
  player voted for.
- **Ignored, not rejected:** answers from players outside the room, votes for players outside
  the room, and self-votes when `allowSelfVote` is false. The fixtures include these cases.
- **`end_game` is idempotent** so a double click doesn't show an error. It doesn't reveal an
  open round.

### For B (Tahshon)

- `reveal_round` and `end_game` are live on `dev` and in `database.ts`, so
  `feat/round-services` can call them. Both return nothing: refetch, or let realtime do it.
- Your `scoring.ts` and the server agree on every fixture. If you add a fixture, the parity
  test picks it up automatically; run it locally before merging.

---

## Phase 2 — Realtime fixes (`fix/rounds-channel-topic`)

All Phase 2 PRs (#13–#18) are on `main`. Before the exit gate, C ran a realtime smoke test on
`dev` with three anonymous users (host, guest, outsider).

**Found:** the host did not see the guest join. The test subscribed and then joined right after
`SUBSCRIBED`, and the event was lost. Diagnosis on `dev`:
- `SUBSCRIBED` arrived after 96 ms; the server's "Subscribed to PostgreSQL" system message after
  214 ms. Changes in that 118 ms gap are never delivered.
- With a pause, or after waiting for the system message, events arrive (sometimes twice).
- Access rules were not the problem: filtered and unfiltered channels behaved the same.

**Fixed in `useRoomSession`:**
- The rounds channel refetches on the `postgres_changes` system confirmation. The snapshot
  covers every table, so this closes the gap for A's `rooms`/`players` channel too.
- The rounds channel topic has a counter suffix (A's note in `contributor-a-findings.md`).
  Confirmed in realtime-js 2.117.3: `channel()` returns an existing topic
  (`RealtimeClient.js:340`), and `on()` after `subscribe()` throws (`RealtimeChannel.js:421`).

**Smoke test after the fix (on `dev`):** the host sees the guest join and the room switch to
`playing`; the guest sees the round start; the round event contains no answer key; an outsider
subscribed to the room receives nothing. 416 unit tests, lint, typecheck, and build pass.

**For A:** open item 10. `subscribeToRoom` should refetch on the system message instead of
`SUBSCRIBED`.

---

## Phase 2 — Room session (`feat/room-session`)

**Status:** merged **before** A's `feat/room-services` and `feat/home-page`, a change to the
plan.md merge order agreed with A so `feat/join-lobby` can build on `RoomPage`. This is safe:
until A's services replace the stubs, `/room/:code` shows "Something went wrong" instead of the
old placeholder spinner, and nothing else changes. Everything is tested with those services
mocked; the end-to-end check in two browsers happens when `feat/room-services` merges.
**Checks:** `npm run lint`, `npm run typecheck`, `npm test` (292 tests, 17 new), `npm run build`.

### What was built

| File | Purpose |
|---|---|
| `src/app/useRoomSession.ts` | Sign in → snapshot → subscribe (`subscribeToRoom` plus a `rounds` channel) → refetch on events |
| `src/app/RoomPage.tsx` | Loading, errors, non-member redirect, and the view for `room.status` |
| `src/app/useRoomSession.test.tsx` | 11 hook tests and 6 RoomPage tests |

### Decisions

- **Events only trigger a refetch,** debounced by 100 ms so a burst (a reveal touches every
  player row) causes one snapshot request.
- **The newest request wins.** Each load is numbered; a slow older response is ignored.
- **Which errors end the session:** before the first snapshot, any error. After it, only
  `ROOM_EXPIRED`, `ROOM_NOT_FOUND`, `NOT_A_MEMBER`, and `INVALID_ROOM_CODE`; a failed refetch
  for any other reason keeps the last good session.
- **RoomPage errors:** `NOT_A_MEMBER` redirects to `/join/<CODE>`. Not found, expired, and
  invalid codes get a message and a link home with no retry. Everything else gets "Try again".
- **`connection` is always `'connected'`** for now. Reconnect handling (refetch on reconnect
  and tab focus, the banner) is Phase 4's `feat/reconnect`, as planned.
- **The finished view is a placeholder** ("Game over" and a link home) until `FinalScreen` in
  Phase 4.
- The React hooks lint rule `set-state-in-effect` doesn't allow resetting state at the start of
  the effect, so state is tagged with the code and attempt it belongs to instead.

### For A

`subscribeToRoom` must subscribe to `rooms` (`id=eq.<roomId>`) and `players`
(`room_id=eq.<roomId>`), call `onChange()` with no arguments, and return a cleanup function. The
hook handles `rounds` itself. Details in `docs/dev-notes.md` ("Room session").

---

## Phase 2 — Review follow-up (`fix/contract-review-items`)

Fixes for A's review of `feat/shared-contracts` (open items 1–4 above).

| File | Change |
|---|---|
| `src/test/fixtures.ts`, `fixtures.test.ts` | `ROOM_CODE` is `ABCDE`; a test checks it passes `isValidRoomCode` |
| `src/lib/errors.ts`, `errors.test.ts` | `toAppError(error, httpStatus?)` and `getErrorMessage(error, httpStatus?)`. Postgres `42501` (no session) and PostgREST `PGRST301` (expired token) now map to `NOT_AUTHENTICATED`. New `NAME_INVALID` text |
| `supabase/migrations/20261012234438_join_room_finished.sql` | `join_room` raises `ROOM_FINISHED` for a finished room. Members can still rejoin to see the final screen |

**For A's services:** destructure `status` from every RPC response and call
`toAppError(error, status)`. `toAppError(error)` alone still works; it just can't detect real
HTTP 429/5xx responses.

**Checks:** the new `join_room` differs from the old one by exactly the three
`ROOM_FINISHED` lines (diffed). PGlite: 5 new checks plus the full room (46) and round (49)
suites rerun on top of the new migration, all passing.

---

## Phase 2 — Rooms, Lobby, and Backend Core

**Branches:** `feat/room-rpcs` (PR #10, `7bb5de1`) and `feat/round-rpcs` (PR #11, `fe08696`),
both merged and applied to `dev`. `feat/room-session` is described above; it merges after A's
`feat/room-services` and `feat/home-page`.
**Checks on `main` at `fe08696`:** `npm run lint`, `npm run typecheck`, `npm test` (270 tests),
`npm run build`, and `npm run test:db` (20 tests against `dev`) all pass.

### What was built

| File | Purpose |
|---|---|
| `supabase/migrations/20261012231009_room_rpcs.sql` | `create_room`, `join_room`, `get_room_snapshot` |
| `supabase/migrations/20261012232249_content_sync.sql` | First content load: 18 items per mode |
| `supabase/migrations/20261012232300_round_rpcs.sql` | `start_round`, `submit_answer` |
| `scripts/sync-content.ts`, `scripts/contentSync.ts` | `npm run content:sync` |
| `tests/integration/room-rpcs.test.ts`, `round-rpcs.test.ts` | `npm run test:db` |

### How to call the RPCs

| RPC | Arguments | Returns | Who |
|---|---|---|---|
| `create_room` | `{ display_name }` | `RoomMembership` | anyone signed in |
| `join_room` | `{ code, display_name }` | `RoomMembership` | anyone signed in |
| `get_room_snapshot` | `{ code }` | `RoomSnapshot` | members |
| `start_round` | `{ room_id, mode }` | `Round` | host |
| `submit_answer` | `{ round_id, payload }` | nothing | members |

Results are already camelCase contract shapes, so cast them (`data as unknown as Round`) and
don't remap fields. Errors arrive as the bare code in `error.message`; pass them to `toAppError`.

### Decisions

- **`get_room_snapshot` refuses non-members** with `NOT_A_MEMBER` instead of returning
  `me: null`, so a room's players are never visible before joining. RoomPage sends
  `NOT_A_MEMBER` to `/join/:code`.
- **Rejoin is automatic.** `join_room` from a browser that already joined returns its existing
  player and ignores the new name, even after the game starts.
- **Rate limits:** 5 rooms created and 20 new rooms joined per browser per hour, counted from
  the rows those calls create. **Known gap:** failed attempts (wrong codes) can't be counted,
  because a raised error rolls back everything the call wrote.
- **`submit_answer` is also the edit call.** It replaces the answer until the reveal, keeps only
  the mode's field, trims word guesses, and updates `submissionCount`.
- **Content sync stores `mode` inside `public_payload`,** so `start_round` copies it into
  `rounds.prompt_snapshot` unchanged. `allowSelfVote` is public (default `false`), as B proposed.
  Removed items become `active = false` rather than being deleted.

### Parity with A's and B's rules

- **Room codes and names:** the SQL cleaners were run side by side with `normalizeRoomCode`,
  `validateRoomCodeInput`, and `validateDisplayName` on 27 tricky names and 17 codes. Every
  result matched.
- **Answers:** `submit_answer` was run side by side with `validateAnswerPayload` on 27 payloads
  across all modes. Every result matched.
- **Whitespace (B's note 1):** handled. Postgres `btrim` and `\s` only cover ASCII, so the SQL
  uses `private.js_whitespace_class()`, the same set JS `trim()` removes, including tabs and
  newlines. `"\tzebra\n"` trims to `zebra`.
- **Trimmed length (B's note 2):** handled. Word guesses must be 1–60 characters after trimming.

### Confirmation of plan §1.5 for B

C confirms B's payloads and scoring rules (B's findings §3–4) match the SQL so far. Scoring
itself is in Phase 3 (`reveal_round`), which will:
- trim with the JS whitespace set and lowercase, matching `normalizeAnswer`, and compare against
  the stored (already normalized) `targetAnswer` and `acceptedAnswers`;
- ignore self-votes unless `allowSelfVote`, and votes or answers from players outside the room;
- write a result for every player, with `isCorrect` set to `pointsAwarded > 0` for trivia and
  word guessing and `null` for social;
- be checked against every case in `scoring.fixtures.json`, inserting self-vote rows directly as
  B describes.

### Testing approach

Docker isn't installed, so each migration was checked in three ways:
1. **PGlite** (Postgres running inside Node) with stand-ins for Supabase's `auth` schema and
   roles: 50 schema checks, 46 room RPC checks, 49 round RPC checks.
2. **Parity runs** against A's and B's TypeScript validators (above).
3. **`npm run test:db` against `dev`** as real anonymous users: 20 tests. `ROOM_EXPIRED` can't be
   set up from a client (rooms last 12 hours), so it's only checked in PGlite.

---

## Phase 1 — Foundation and Contracts

**Branches:** `chore/scaffold` (PR #1), `feat/shared-contracts` (PR #2),
`chore/contract-name-invalid` (PR #3), `feat/initial-schema` (PR #9). All merged.

### What was built

- Vite 8, React 19, TypeScript 6, Node 24; ESLint, Prettier, Vitest + RTL; CI running lint,
  typecheck, test, and build on every PR.
- An ESLint rule that blocks importing `src/content` from app code, so answers never ship in the
  bundle.
- `src/lib/supabaseClient.ts` (lazy client, shared anonymous sign-in), routes, theme tokens,
  shared components, and stubs for A and B.
- `src/types/game.ts` (full contract), `src/lib/errors.ts`, `src/test/fixtures.ts`.
- Supabase `dev` (`nlpqfmsijyeyhfvssain`) and `prod` (`defxqdxgrwnwfhjtsaya`), both with
  anonymous sign-ins on.
- Initial schema: six tables, constraints matching A's rules, read-only RLS for clients, no
  client writes, answer tables unreadable, realtime on `rooms`, `players`, `rounds`.

### Decisions

- **When the contract and a plan disagree, the plan wins.** The invalid-name code became
  `NAME_INVALID` (PR #3), and room codes use the plan's 31-character alphabet.
- **`RoomSession.me` is never null,** and the session has `isHost` and `refresh()`.
- **Social scoring:** `pointsAwarded` is the number of votes a player received.

### What went wrong

- **PR #2 merged before A and B reviewed it.** A's review items are now in the open items table.
- **A fix was pushed to an already-merged branch.** The `NAME_INVALID` rename went to
  `feat/shared-contracts` after PR #2 merged, so it never reached `main`. It became PR #3. At the
  same time A's PR #4 followed the old name, the two crossed, and `main`'s typecheck broke until
  A's `fix/name-invalid-code` (PR #8). Lesson: check a PR is still open before pushing to its
  branch, and merge contract fixes before dependent work.
- **Two PRs were merged with merge commits instead of squash.** Everyone now uses "Squash and
  merge".
