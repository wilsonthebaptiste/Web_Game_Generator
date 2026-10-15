# Contributor A project findings

Findings from Contributor A (Wilson, Room and Lobby) while working through
[`contributor-a-wilson.md`](contributor-a-wilson.md). Newest phase at the top.

---

## Phase 2 — Rooms, Lobby, and Backend Core

**Branches:** `feat/room-services`, `feat/home-page` and `feat/join-lobby`, cut from `main` at
`9ca299d`. That `main` includes C's `feat/room-rpcs` (#10), `fix/contract-review-items` (#12)
and `feat/room-session` (#13), plus B's `feat/mode-picker` (#14).
**Checks:** `npm run lint`, `npm run typecheck`, `npm test` (414 tests, 87 of them new),
`npm run format:check` and `npm run build` all pass.
**Merge order:** C's `feat/room-session` merged first by agreement (see C's findings). Mine
merged in order as PRs #16 (`feat/room-services`), #17 (`feat/home-page`) and #18
(`feat/join-lobby`).
**Status: complete.** The Phase 2 exit gate passed on 2026-10-14 against `dev`, with two browsers
(a normal and a private window).

### Exit gate results

| Check | Result |
|---|---|
| Browser 1 creates a room and sees the code and join link. Browser 2 joins by link and both lobbies update without a refresh. | Pass |
| Copy link, `/join/:code` prefill, and focus on the name field | Pass |
| Empty name, short code, unknown code (`ZZZZZ`), duplicate name (case-insensitive) | Pass: friendly message each time |
| Expired room | Can't be set up by hand (rooms last 12 hours). Covered by C's `ROOM_EXPIRED` database tests. |
| Console as a non-host: `start_round` | Rejected with `NOT_HOST` |
| Console: `round_secrets`, `content_items`, other players' `answers` | No rows returned |
| `RoundView` and `ResultsView` from fixtures (B) | Covered by B's RTL tests on `main` |

**Setup for manual testing:** copy `.env.example` to `.env` and fill in the `dev` URL and
publishable key (ask C). Each browser profile is one anonymous player, so a second player needs a
private window or another browser. Before any of that, a Node script ran anonymous sign-in,
`create_room` and a bad-code `join_room` against `dev` to confirm the connection.

### What was built

| File | Purpose |
|---|---|
| `src/services/rooms.ts` | `createRoom`, `getRoomSnapshot`, `subscribeToRoom`, plus `callRoomRpc` shared with `players.ts`. `endGame` stays a stub until Phase 3. |
| `src/services/players.ts` | `joinRoom` |
| `src/features/home/HomePage.tsx`, `home.css` | Create and join forms, `/join/:code` prefill |
| `src/features/lobby/LobbyPage.tsx`, `lobby.css` | Room code, copyable join link, player list, host `ModePicker`, guest waiting state |
| `*.test.ts(x)` next to each file | Mocked Supabase client, mocked services, and lobby fixtures |

### Decisions

**Services**
- **Every RPC goes through `callRoomRpc`.** It calls `ensureAnonymousSession()` first and passes
  the response's HTTP `status` to `toAppError`, following C's convention. It also turns anything
  thrown into an `AppError`, including sign-in failures, network errors and `CONFIG_MISSING`.
  Players never see a raw Postgres message; a test checks this with a real `23505`
  unique-violation message.
- **Room codes are normalized in the services too.** `joinRoom` and `getRoomSnapshot` call
  `normalizeRoomCode`, so `useRoomSession` can pass the code straight from the URL.

**`subscribeToRoom` (for C)**
- **Each call opens a new channel.** realtime-js 2.117 returns the existing channel when a topic
  is already open, and a subscribed channel can't take new listeners. Each call therefore uses
  its own topic (`room:<id>:<n>`). Without this, React StrictMode's subscribe → unsubscribe →
  subscribe would break. C's separate `rounds` subscription should use a different topic too.
- **Filters:** `rooms` is filtered by `id=eq.<roomId>` (the table has no `room_id` column), and
  `players` by `room_id=eq.<roomId>`.
- **`onChange` also fires on every `SUBSCRIBED` status, including re-subscribes.** This closes
  two gaps: a player who joins between the first snapshot fetch and the channel connecting, and
  changes missed while the channel was down. It means one extra snapshot fetch right after
  mounting. It also covers the "refetch on `SUBSCRIBED`" part of C's Phase 4 `feat/reconnect`.
- **Unsubscribing is safe to repeat.** The unsubscribe function only calls `removeChannel` the
  first time.

**Home page**
- **Field-level server errors:** `NAME_INVALID` and `NAME_TAKEN` show under the name field;
  `INVALID_ROOM_CODE` and `ROOM_NOT_FOUND` show under the code field.
- **Form-level server errors:** everything else appears in an `ErrorMessage` box. That covers
  `ROOM_EXPIRED`, `ROOM_FINISHED`, `ROOM_NOT_JOINABLE`, `RATE_LIMITED` and `NETWORK_ERROR`.
- **Double-submit guard:** a ref blocks a second submit before React re-renders, and the button
  is disabled with "Creating room…" or "Joining room…" while the request is in flight.
- **`/join/:code`:**
  - The code is normalized and prefilled, and shown as "You're joining room ABCDE".
  - The join form moves first and the name field gets focus.
  - `/` and `/join/:code` render the same component, so the forms are keyed by the code and
    reset when the link changes.
- **The code field uppercases as you type.** Spaces and dashes are still accepted; validation
  strips them.

**Lobby**
- **The room code is large:** `clamp(2.5rem, 14vw, 4rem)` in a monospace font with wide letter
  spacing, so it can be read from across a room and still fits at 360px.
- **The join link is shown as well as copied.** It sits in a read-only field that selects its
  whole text on focus. The Clipboard API only works over https or on localhost, so on a phone
  opening `http://<LAN IP>` the copy button fails. The lobby then says
  "Couldn't copy automatically. Select the link above and copy it."
- **Copy feedback:** "Link copied" is announced through `role="status"` and clears after 4
  seconds.
- **Badges:** the host badge is "★ Host", with the star hidden from screen readers so the text
  carries the meaning. Your own row has a "You" badge and a thicker border, so color is never the
  only cue.
- **Empty states:** with no players the lobby says "No one has joined yet." With only the host
  it says "Waiting for others to join. Share the code or the link."
- **Mode selection:** the host's `ModePicker` starts on `room.selectedMode`, which is null for a
  new room. The choice stays in local state until Phase 3's Start button.
- **Non-hosts never get host controls.** They see "Waiting for host to start…" (`role="status"`)
  and no picker. Tests check this for both guests.
- **The `h1` reads "Lobby ABCDE" to screen readers,** with the code part visually hidden, since
  the code is already shown large. C's `RoomPage` tests in `useRoomSession.test.tsx` look for
  that heading name.

### Notes for the team

- **For C:** `routes.test.tsx` still passes; it relies on the `Party Game Generator` heading and
  on the `/join/:code` code appearing as text.
- **For C:** a successful create or join navigates to `/room/<code>` using the code from the
  RPC result. `RoomPage` can call `getRoomSnapshot(code)` right away, because the browser is
  already a member.
- **For C:** `useRoomSession` opens its `rounds` channel with a fixed topic,
  `room-rounds:<roomId>`. realtime-js reuses an open channel with the same topic. If the hook
  re-subscribes before the old channel is removed (a retry, or Phase 4 reconnects), adding
  listeners to the reused, already-subscribed channel throws. A unique suffix, as in
  `subscribeToRoom`, avoids it. Low priority: the subscribe runs after an awaited fetch, so the
  StrictMode double mount probably doesn't hit it. C's PR #19 (`fix/rounds-channel-topic`)
  addresses this.

---

## Phase 1 — Foundation and Contracts

**Branches:** `feat/room-code-utils` (PRs #4 and #5) and `fix/name-invalid-code` (PR #8), all
merged.
**Checks:** `npm run lint`, `npm run typecheck`, `npm test` (94 tests) and `npm run format:check`
all pass on top of `main` at `8463e26`, which includes `feat/shared-contracts`.

### What was built

| File | Exports |
|---|---|
| `src/lib/roomCodes.ts` | `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `normalizeRoomCode`, `isValidRoomCode` |
| `src/lib/validation.ts` | `validateDisplayName`, `validateRoomCodeInput`, `DISPLAY_NAME_MAX_LENGTH` |
| `src/lib/roomCodes.test.ts`, `src/lib/validation.test.ts` | Vitest coverage |

### Agreed rules (C confirmed the SQL matches)

**Room codes**
- 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 characters). The alphabet leaves out
  `0/O` and `1/I/L`, so a code read aloud or from across the room can't be mistyped.
- `normalizeRoomCode` uppercases the input and strips all whitespace and dashes, so `" ab-cd e "`
  becomes `ABCDE`. It doesn't remove other characters; `isValidRoomCode` rejects those.

**Display names**
- 1–20 characters after trimming. The limits come from `GAME_LIMITS` in `src/types/game.ts`.
- **Length counts Unicode code points, not visible characters.** This matches Postgres
  `char_length`, so the client and server always agree. As a result, an emoji built from several
  code points uses more of the 20. For example, 👨‍👩‍👧 counts as 5.
- The name is NFC-normalized before checking, so `e` plus a combining accent counts as one
  character, the same as `é`.
- Control characters (`\p{Cc}`, including newline, tab, NUL and DEL) and line/paragraph
  separators are rejected. Emoji, accents and non-Latin scripts are allowed. Inner spaces and
  letter case are kept.

**Return shape**
- Success returns `{ ok: true, value }`, where `value` is the cleaned string to send to the RPC.
- Failure returns `{ ok: false, code, reason, message }`:
  - `code` is a contract `AppErrorCode`: `NAME_INVALID` or `INVALID_ROOM_CODE`.
  - `reason` is a short machine-readable tag such as `empty`, `too_long`, `wrong_length` or
    `invalid_characters`.
  - `message` is friendly text that the home page can show as is.

### Review of `feat/shared-contracts` (PR #2)

PR #2 was merged before A's review, so the open items below need a follow-up from C on a
`chore/contract-*` branch.

**Works as is for A**
- `Room`, `Player`, `CreateRoomInput`, `JoinRoomInput` and `RoomMembership`.
- The service signatures `createRoom`, `joinRoom`, `getRoomSnapshot`, `subscribeToRoom` and
  `endGame` are unchanged.
- `RoomSession.me` is never null, and `isHost` and `refresh()` were added. This simplifies the
  lobby.
- `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_NOT_JOINABLE`, `NAME_TAKEN` and `RATE_LIMITED` all
  exist and have friendly messages.

**Open items for C**
1. **The fixture room code is invalid.** `ROOM_CODE = 'ABCD'` in `src/test/fixtures.ts` is 4
   characters, but codes are 5. Lobby join-link tests would show an impossible code, and any
   test that runs it through `isValidRoomCode` fails. Proposed fix: change it to `'ABCDE'`.
2. **Two codes could cover a finished room.** `ROOM_NOT_JOINABLE` says "This game has already
   started", while `ROOM_FINISHED` says "This game has ended". A needs confirmation that
   `join_room` raises `ROOM_FINISHED` for a finished room and `ROOM_NOT_JOINABLE` only for a game
   in progress. The Phase 4 "This game has ended" screen depends on this.
3. **`toAppError` can't see HTTP status.** It checks `error.status`, but supabase-js puts the
   status on the RPC response (`{ data, error, status }`), not on the error object. Rate-limit
   (429) and server (5xx) errors would fall through to `UNKNOWN`. C should decide between two
   fixes:
   - a documented convention, where services attach the status before converting;
   - a helper in `errors.ts`.
4. **Minor:** the `NAME_INVALID` message mentions only length. If the server rejects a
   name for a control character, the message is misleading. A's client check catches this first,
   so it's low priority.

### Changes made to match the contract

- The invalid-name code is `NAME_INVALID`, as in the plan. `feat/shared-contracts` first
  shipped it as `INVALID_DISPLAY_NAME`, and PR #4 followed that. C then renamed it back in PR #3
  ("when the plan and the code disagree, the original plan wins"). The two PRs crossed and
  broke `main`'s typecheck, which `fix/name-invalid-code` repairs.
- `validateRoomCodeInput` returns the contract's `INVALID_ROOM_CODE`.
- The name length limit now comes from `GAME_LIMITS` instead of a separate constant.

### Notes for Phase 2

- **`ensureAnonymousSession()` already exists** in `src/lib/supabaseClient.ts`. It shares one
  in-flight sign-in between concurrent callers. Use it, and don't write a second helper. This
  answers the Phase 2 question to C.
- `getSupabase()` throws a `CONFIG_MISSING` `AppError` when `.env` is missing. That means pages
  and tests work without Supabase credentials.
- **Error handling convention:** services should `throw toAppError(error)`. RPC failures raise the
  bare code, or `CODE: detail`, and `toAppError` reads the part before the colon.
- **Lobby fixtures:** `lobbyHost`, `lobbyGuest` and `lobbyHostAlone` (the one-player state).
  `viewAs(session, playerId)` switches the viewer.
- **Mocking:** mock the Supabase client with `vi.hoisted` plus `vi.mock`, following the pattern in
  `src/lib/supabaseClient.test.ts`.
- **Merging:** use "Squash and merge" (see `docs/dev-notes.md`).
