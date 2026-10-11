# Contributor A project findings

Findings from Contributor A (Wilson, Room and Lobby) while working through
[`contributor-a-wilson.md`](contributor-a-wilson.md). Newest phase at the top.

---

## Phase 1 — Foundation and Contracts

**Branch:** `feat/room-code-utils` (commit `bbed5c0`). It was pushed but is not merged yet.
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
