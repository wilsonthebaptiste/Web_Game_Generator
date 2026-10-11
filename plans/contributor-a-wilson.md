# Contributor A — Wilson: Room and Lobby

Read [`../plan.md`](../plan.md) first. The phase numbers here match it. Your work covers spec §2.1–2.2, the home and lobby pages in §5, and the room and lobby acceptance criteria in §13.

## Your files

**You own (edit freely on your branches):**
- `src/features/home/` (`HomePage.tsx`, `home.css`, tests)
- `src/features/lobby/` (`LobbyPage.tsx`, `lobby.css`, tests)
- `src/services/rooms.ts`, `src/services/players.ts`
- `src/lib/roomCodes.ts`, `src/lib/validation.ts`

**You import from (never edit):**
- `src/types/game.ts`: `Room`, `Player`, `RoomSession`, `CreateRoomInput`, `JoinRoomInput`, `AppError`
- `src/lib/supabaseClient.ts`, `src/lib/errors.ts`, `src/components/*` (C)
- `src/features/game/ModePicker.tsx`, `src/services/rounds.ts` → `startRound` (B)

**Never edit:** `src/app/`, `src/types/`, `supabase/`, `package.json`, configs, `src/features/game/`, `src/features/leaderboard/`. Ask the owner instead.

**What you deliver to others:**
- To C: `createRoom`, `joinRoom`, `getRoomSnapshot`, `subscribeToRoom`, `endGame`. C's `useRoomSession` and `FinalScreen` call these.
- To B: `endGame`, called from the results host controls.
- To C: `normalizeRoomCode` and `ROOM_CODE_ALPHABET`. C's `create_room` SQL must generate codes from the same alphabet.

---

## Phase 1 — Foundation and Contracts

**Wait for:** C's `chore/scaffold` to merge before branching.

**Before the scaffold merges (no branch needed):**
- [x] Review C's `feat/shared-contracts` PR, focusing on `Room`, `Player`, `RoomSession.me`, `CreateRoomInput`, `JoinRoomInput`, the signatures in `rooms.ts` and `players.ts`, and the error codes `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_NOT_JOINABLE`, `NAME_INVALID`, `NAME_TAKEN`, and `RATE_LIMITED`.
- [x] Propose the room code format to C, for example 5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0/O/1/I/L`), and the display-name rules, for example 1–20 characters after trimming with no control characters.

**Branch `feat/room-code-utils`:**
- [x] `src/lib/roomCodes.ts`: `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `normalizeRoomCode(input)` (uppercase, strip spaces and dashes), `isValidRoomCode(code)`.
- [x] `src/lib/validation.ts`: `validateDisplayName(name) → { ok: true, value } | { ok: false, code: "NAME_INVALID", reason }`.
- [x] Vitest tests for both, covering empty input, whitespace, lowercase input, ambiguous characters, max length, and emoji/unicode.

**Done when:** tests pass, the PR is merged, and C has confirmed the same alphabet and length are used in SQL.

---

## Phase 2 — Rooms, Lobby, and Backend Core

**Wait for:** C's `feat/room-rpcs` before `feat/room-services`. Build UI against mocked services in the meantime.

**Branch `feat/room-services`:**
- [ ] Replace C's stubs in `services/rooms.ts` and `services/players.ts` with calls to `supabase.rpc("create_room" | "join_room" | "get_room_snapshot")`.
- [ ] Call `signInAnonymously()` only if there is no session. Ask C whether this helper lives in `supabaseClient.ts`, and don't duplicate it.
- [ ] Convert RPC errors into `AppError` using `src/lib/errors.ts`. Never show raw Postgres messages.
- [ ] `subscribeToRoom(roomId, onChange) → unsubscribe` for Postgres changes on `rooms` and `players` filtered by `room_id`.
- [ ] Tests with a mocked supabase client: success paths, error-code mapping, unsubscribe cleanup.

**Branch `feat/home-page`:**
- [ ] Create Room form (display name) → `createRoom` → navigate to `/room/:code`.
- [ ] Join Room form (room code + display name) → `joinRoom` → navigate. On `/join/:code`, prefill the code from the route param.
- [ ] Client-side validation using `validation.ts` and `roomCodes.ts`. Disable the submit button while a request is in flight so a double click can't create two rooms.
- [ ] Loading, validation, and error states, each with a visible text message.
- [ ] RTL tests: invalid input blocks the submit, an error code shows a friendly message, the prefill works.

**Branch `feat/join-lobby`** (after C's `feat/room-session` and B's `feat/mode-picker` merge):
- [ ] `LobbyPage({ session }: { session: RoomSession })`: room code, a copy button for the join link (`${origin}/join/${code}`), a player list with a host badge (text + icon, not color alone), and a "you" indicator.
- [ ] Host sees `ModePicker` (selection is local state for now). Non-hosts see "Waiting for host to start…".
- [ ] RTL tests: host vs non-host rendering, copy-link behavior, empty and one-player states.

**Done when:** the Phase 2 exit gate in `plan.md` passes in two browsers.

---

## Phase 3 — Round Loop and Trusted Scoring

**Wait for:** B's `feat/round-services`, which provides the real `startRound`.

**Branch `feat/lobby-start-game`:**
- [ ] "Start game" button: host only, disabled until `players.length >= 2` with the reason shown as text, calls `startRound(roomId, selectedMode)`.
- [ ] Handle `NOT_ENOUGH_PLAYERS`, `NOT_HOST`, and `INVALID_MODE` with friendly messages, and guard against double clicks.
- [ ] Add `endGame(roomId)` to `services/rooms.ts` (calls the `end_game` RPC) and tell B and C it has merged.
- [ ] RTL tests: the button's enabled and disabled states, the call made with the selected mode.

**Done when:** the host starts a game from the lobby and both browsers move to the game view.

---

## Phase 4 — End Game, Resilience, and Hardening

**Branch `fix/home-lobby-polish`:**
- [ ] Mobile layout at 360px wide with no horizontal scroll. Large tap targets. A room code that can be read from across a room.
- [ ] Keyboard access, visible focus rings, `<label>` on every input, sensible contrast.
- [ ] Clear states for expired room, finished room, room not found, network failure, and rate limited.
- [ ] A finished room opened by a non-member shows "This game has ended" and a link home.

**Branch `test/lobby-ui`:**
- [ ] Fill gaps in RTL coverage for home and lobby. Add a test that non-hosts never see host controls.

**Manual check:** run the Room and Lobby section of `docs/manual-test-checklist.md` (from C) on a phone and a desktop.

---

## Phase 5 — Deployment and Launch

- [ ] On the production URL, smoke-test create, join by code, join by link, duplicate name, invalid code, and the live lobby, on a phone and a desktop.
- [ ] Fix any issues on `fix/<short-name>` branches inside your own folders.
- [ ] Send any setup notes for the README to C. Don't edit the README yourself.

---

## Claude Code prompt template

> Read `spec.md`, `GIT_WORKFLOW.md`, `plan.md`, and `plans/contributor-a-wilson.md`. I am Contributor A (Room and Lobby). I may edit only `src/features/home/`, `src/features/lobby/`, `src/services/rooms.ts`, `src/services/players.ts`, `src/lib/roomCodes.ts`, and `src/lib/validation.ts`. Implement the **[Phase N, branch name]** checklist. Use the types in `src/types/game.ts` as they are. Do not modify shared types, routing, components, package files, configs, or `supabase/`. If you need a change there, stop and tell me what to request. Add tests. Run `npm run lint && npm run typecheck && npm test`, then summarize changed files, test results, and any interface concerns. Do not commit, push, merge, or run destructive Git commands.
