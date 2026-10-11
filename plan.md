# Party Game Generator — Overall Build, Test, and Deploy Plan

This plan turns `spec.md` into five gated phases that follow the ownership and branching rules in `GIT_WORKFLOW.md`. Each contributor has their own plan with matching phases:

| Contributor | Area | Plan |
|---|---|---|
| A — Wilson | Room and Lobby | [plans/contributor-a-wilson.md](plans/contributor-a-wilson.md) |
| B — Tahshon | Game Modes and Round Flow | [plans/contributor-b-tahshon.md](plans/contributor-b-tahshon.md) |
| C — Waliu | Integration, Data, and Delivery | [plans/contributor-c-waliu.md](plans/contributor-c-waliu.md) |

**How phases work:** a phase ends when its exit gate passes on `main`, not on a date. No one starts work for the next phase on a branch that depends on unmerged work from the current phase. Inside a phase, the three contributors work in parallel on separate files.

---

## 1. Key Architecture Decisions (ratify in Phase 1)

These decisions come from the spec's requirements. They shape every phase, so the team confirms them in the Phase 1 contracts review before feature work starts.

### 1.1 Identity: Supabase anonymous auth
- Each browser signs in with `supabase.auth.signInAnonymously()` on first visit. This works on the Free plan; it must be enabled in the Supabase dashboard.
- `players.auth_user_id` stores `auth.uid()`. RLS and RPCs authorize against `auth.uid()`, never against a player ID that the client sends.
- On refresh, supabase-js restores the session from local storage. `get_room_snapshot(code)` returns `me` (the caller's player row) when one exists.
- **Known MVP limitation:** if a player clears storage or switches device, they lose their identity in that room. The host is never reassigned automatically. Document this in the README.

### 1.2 All writes go through trusted RPCs
- Clients get **SELECT-only** RLS policies. No table has client INSERT, UPDATE, or DELETE policies.
- Every state change is a `security definer` Postgres function. Each one checks `auth.uid()`, room membership, the host role, and the current state before it changes anything.

| RPC | Caller | Effect |
|---|---|---|
| `create_room(display_name)` | anyone | Creates the room (server-generated code, collision retry) and the host player. Rate-limited per `auth.uid()`. |
| `join_room(code, display_name)` | anyone | Validates the code, room status, expiry, and name (case-insensitive unique). Inserts the player, or returns the existing player if this `auth.uid()` already joined. |
| `get_room_snapshot(code)` | member | Returns `{ room, players, currentRound, me, myAnswer }`. This is the authoritative fresh state after joining or reconnecting. |
| `start_round(room_id, mode)` | host | Checks the mode, minimum of 2 players, round limit, and that the previous round is revealed. Picks an unused content item on the server and snapshots its public prompt. Sets the room to `playing`. |
| `submit_answer(round_id, payload)` | member | Checks the round is `answering` and the room is not `finished`, then validates the payload for the mode. Upserts the answer on `(round_id, player_id)` and updates `rounds.submission_count`. |
| `reveal_round(round_id)` | host | In one transaction: locks the row (`for update`), rejects a round that is already revealed, scores every answer, updates `players.score`, writes `rounds.reveal_snapshot`, and sets the status to `revealed`. |
| `end_game(room_id)` | host | Sets the room to `finished`. |

### 1.3 Content lives in TS files but answers are never shipped to the browser
- Contributor B owns the source of truth: `src/content/*.ts`.
- **Frontend code never imports `src/content/`.** An ESLint `no-restricted-imports` rule enforces this. Otherwise the correct answers would ship in the JS bundle.
- `npm run content:sync` (owned by C) generates a **new** timestamped migration in `supabase/migrations/`. The migration upserts `content_items(id, mode, public_payload, answer_key, active)`. Old migrations are never edited.
- `start_round` copies `public_payload` into `rounds.prompt_snapshot` and copies `answer_key` into `round_secrets`. `round_secrets` has no client policies.
- `reveal_round` writes the correct answer and every player's answer and points into `rounds.reveal_snapshot`. Clients only read this after the reveal.

### 1.4 Data model (refines spec §8)
- `rooms`: `id, code (unique), host_player_id, status, selected_mode, current_round_id, round_limit (default 10), created_at, updated_at, expires_at`
- `players`: `id, room_id, auth_user_id, display_name, score, joined_at`. Unique on `(room_id, auth_user_id)` and on `(room_id, lower(display_name))`.
- `rounds`: `id, room_id, round_number, mode, content_id, status, prompt_snapshot, reveal_snapshot, submission_count, created_at, revealed_at`. Unique on `(room_id, round_number)`.
- `round_secrets`: `round_id (pk), answer_key`. No client access.
- `answers`: `id, round_id, player_id, answer_payload, submitted_at, updated_at, points_awarded`. Unique on `(round_id, player_id)`. A player can SELECT only their own rows.
- `content_items`: `id, mode, public_payload, answer_key, active`. No client access.
- RLS: a caller can SELECT `rooms`, `players`, and `rounds` only for rooms where they have a player row.
- Realtime publication: `rooms`, `players`, `rounds` only. `answers` and `round_secrets` are never published.

### 1.5 Answer payloads and scoring rules
| Mode | Payload | Scoring (performed only in `reveal_round`) |
|---|---|---|
| `trivia` | `{ choiceId: string }` | +1 if `choiceId === correctChoiceId` |
| `word-guessing` | `{ text: string }` (1–60 chars) | +1 if `normalize(text)` equals `normalize(targetAnswer)` or any accepted variant. `normalize` = trim + lowercase. |
| `social` (`vote-for-player`) | `{ votedPlayerId: uuid }` | +1 to the voted player for each vote. Self-votes are rejected unless the prompt sets `allowSelfVote`. |

Social `free-text` prompts are **out of MVP content**. All social content is `vote-for-player`, which keeps scoring deterministic.

### 1.6 Frontend shape
- Routes (owned by C): `/` → `HomePage` (A), `/join/:code` → `HomePage` with the code prefilled (A), `/room/:code` → `RoomPage` (C).
- `RoomPage` uses `useRoomSession(code)` (C) and picks a view from `room.status`: `lobby` → `LobbyPage` (A), `playing` → `GamePage` (B), `finished` → `FinalScreen` (C).
- Every feature view receives the same `RoomSession` prop type from `src/types/game.ts`. Feature pages never open their own top-level subscriptions. Realtime and reconnect logic is centralized in `useRoomSession`.
- Styling: plain CSS. Global tokens live in `src/app/theme.css` (C). Each feature has one CSS file with class names prefixed by the feature (`.home-`, `.lobby-`, `.game-`, `.lb-`).
- Errors: services throw `AppError { code: AppErrorCode; message }`. RPCs `raise exception` with a stable code string such as `NAME_TAKEN`. `src/lib/errors.ts` (C) maps codes to friendly messages.

### 1.7 Ownership additions (C updates the table in `GIT_WORKFLOW.md` §4 in Phase 1)
| Path | Owner |
|---|---|
| `src/lib/validation.ts` (display name, room code input) | A |
| `src/features/game/rules/` (normalization, payload validation, scoring reference and fixtures) | B |
| `src/features/game/ModePicker.tsx` (used by the lobby and results views) | B |
| `src/app/RoomPage.tsx`, `src/app/useRoomSession.ts`, `src/app/theme.css` | C |
| `src/lib/errors.ts`, `src/test/fixtures.ts`, `src/test/setup.ts` | C |
| `scripts/` (content sync), `tests/integration/`, `docs/` | C |
| `.github/workflows/` | C |

**One-time scaffold handoff:** in Phase 1, C creates **stub** files in A's and B's folders: placeholder pages, plus service files with the agreed signatures that `throw new Error("not implemented")`. Then routes and imports never need to change later. Once the scaffold PR merges, ownership of those stubs passes to A and B, and C does not edit them again.

---

## 2. Phase 1 — Foundation and Contracts

**Goal:** `main` runs, CI is green, every shared contract is agreed and merged, and both Supabase projects exist.

| Who | Work | Branches |
|---|---|---|
| C | Vite + React + TS scaffold. Installs every expected dependency up front. ESLint/Prettier, Vitest + RTL, CI, `.env.example`, `.gitignore`, router, shared components, stub pages, and stub services. | `chore/scaffold` |
| C | `src/types/game.ts` with the full contract, `src/lib/errors.ts`, and `src/test/fixtures.ts`. A and B **must review** this PR. | `feat/shared-contracts` |
| C | Supabase `dev` and `prod` projects, anonymous auth enabled, initial schema migration (tables, constraints, indexes, RLS, realtime publication). | `feat/initial-schema` |
| A | Room code helpers and display-name validation with tests. Reviews the room/player contract. | `feat/room-code-utils` |
| B | Content bank (≥15 items per mode) with content tests. Scoring rules with golden fixtures. Reviews the content, payload, and result contracts. | `feat/content-bank`, `feat/scoring-rules` |

**Merge order:** `chore/scaffold` → `feat/shared-contracts` → (`feat/initial-schema`, `feat/room-code-utils`, `feat/content-bank`, `feat/scoring-rules` in any order, because their files don't overlap).

A and B can draft their contract feedback before the scaffold merges. They branch from `main` only after it does.

**Exit gate:**
- [ ] `npm install && npm run dev` works for all three contributors from the README.
- [ ] CI runs `lint`, `typecheck`, `test`, and `build` on every PR, and all are green on `main`.
- [ ] `src/types/game.ts` is approved by A and B. The decisions in §1 are confirmed in the team chat.
- [ ] Initial migration is applied to `dev`. Everyone has a local `.env` pointing to `dev`.
- [ ] `GIT_WORKFLOW.md` ownership table includes the additions from §1.7.

---

## 3. Phase 2 — Rooms, Lobby, and Backend Core

**Goal:** two browsers can create and join a room and watch the lobby update live. The round UI exists and renders from fixtures.

| Who | Work | Branches |
|---|---|---|
| C | RPCs `create_room`, `join_room`, `get_room_snapshot`. Rate limiting and expiry checks. Regenerates `database.ts`. | `feat/room-rpcs` |
| C | `content:sync` script and the first content migration. RPCs `start_round` and `submit_answer`. | `feat/round-rpcs` |
| C | `RoomPage` + `useRoomSession`: snapshot fetch, realtime subscribe, and refetch on events. | `feat/room-session` |
| A | `services/rooms.ts` and `services/players.ts` implemented against the RPCs. | `feat/room-services` |
| A | Home page: create and join forms, `/join/:code` prefill, validation, loading and error states. | `feat/home-page` |
| A | Lobby: code, copy link, player list, host badge, non-host waiting state. | `feat/join-lobby` |
| B | `ModePicker` component. | `feat/mode-picker` |
| B | `RoundView` with per-mode inputs and `ResultsView`, built against `src/test/fixtures.ts`. | `feat/round-view` |

**Merge order:** `feat/room-rpcs` → `feat/room-services` → `feat/home-page` → `feat/room-session` → `feat/join-lobby`. `feat/mode-picker` merges before `feat/join-lobby` so the lobby can embed it. `feat/round-rpcs` and `feat/round-view` can merge at any point in the phase.

**Exit gate:**
- [ ] Browser 1 creates a room and sees the code and join link. Browser 2 joins and both lobbies update without a refresh.
- [ ] An invalid code, an expired room, an empty name, and a duplicate name each show a friendly error.
- [ ] Calling `start_round` from a non-host session in the browser console is rejected (`NOT_HOST`).
- [ ] Querying `round_secrets`, `content_items`, or another player's `answers` from the browser console returns no rows.
- [ ] `RoundView` and `ResultsView` render all three modes from fixtures, with RTL tests.

---

## 4. Phase 3 — Round Loop and Trusted Scoring

**Goal:** a full multi-round game of each mode works end to end, with scores computed only on the server.

| Who | Work | Branches |
|---|---|---|
| C | `reveal_round` (atomic scoring) and `end_game`. Parity test that runs B's golden fixtures against the RPC. | `feat/reveal-scoring` |
| C | `Leaderboard` component and `computeWinners` (handles ties). | `feat/scoreboard` |
| A | Lobby "Start game" (host only, enabled at ≥2 players, uses `ModePicker` + `startRound`). `endGame` in `services/rooms.ts`. | `feat/lobby-start-game` |
| B | `services/rounds.ts` + `services/answers.ts`. `GamePage` composition. Submit and edit answer with double-submit guard. Host lock/reveal, next round, and end-game controls. | `feat/round-services`, `feat/game-flow` |

**Merge order:** `feat/reveal-scoring` → `feat/round-services` → `feat/scoreboard` → `feat/lobby-start-game` → `feat/game-flow`. B's `ResultsView` imports C's `Leaderboard`, so `feat/scoreboard` merges before `feat/game-flow`.

**Exit gate (two or more browsers, each mode):**
- [ ] Host starts a round and every player sees the same prompt.
- [ ] A player submits, sees confirmation, edits before the reveal, and cannot edit after it.
- [ ] Players who did not submit show "No answer" after the reveal.
- [ ] Scores match the rules in §1.5, update for everyone, and carry across rounds.
- [ ] Calling `reveal_round` twice (two clicks or a console call) awards points only once and the second call returns `ROUND_ALREADY_REVEALED`.
- [ ] Scoring parity test passes locally (`npm run test:db`).

---

## 5. Phase 4 — End Game, Resilience, and Hardening

**Goal:** every acceptance criterion in spec §13 passes on the `dev` deployment, except the delivery items.

| Who | Work | Branches |
|---|---|---|
| C | `FinalScreen` (winners with ties, final leaderboard, "New room"). Reconnect handling in `useRoomSession` (refetch on reconnect, tab focus, and channel error). Optional pg_cron cleanup, otherwise access-time expiry only. Security tests for RLS and RPCs. Manual test checklist. | `feat/final-screen`, `feat/reconnect`, `test/rls-security`, `docs/manual-test-checklist` |
| A | Home and lobby polish: mobile layout, focus states, labels, non-color status indicators, expired/finished/network error states. Lobby RTL tests. | `fix/home-lobby-polish`, `test/lobby-ui` |
| B | Game polish: mobile layout, accessible answer controls, correctness shown with icons and text and not only color, round limit UX. Game RTL tests. Content review pass. | `fix/game-polish`, `test/round-ui` |

**Merge order:** `feat/final-screen` → `feat/reconnect`. Everything else is independent and can merge in any order.

**Exit gate:**
- [ ] Every Room/Lobby, Gameplay, and End Game box in spec §13 is checked, using `docs/manual-test-checklist.md` with two or more browsers, one of them a phone.
- [ ] A refresh mid-round and a 30-second network drop (DevTools offline) both recover the correct round, answer status, and scores.
- [ ] A tie for first shows all tied winners.
- [ ] Automated tests cover normalization, scoring, payload validation, `computeWinners`, room code and name validation, and state-transition rejections.

---

## 6. Phase 5 — Deployment and Launch

**Goal:** the production site is live on free tiers, documented, and smoke-tested.

| Who | Work | Branches |
|---|---|---|
| C | Apply all migrations and the content sync to `prod`. Connect Cloudflare Pages to GitHub (build `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). Add the production URL to Supabase settings. README: setup, deploy, content-sync, and known limitations. Secrets audit. | `docs/setup-readme`, `chore/deploy-config` |
| A | Production smoke test of create, join, lobby, and error states on desktop and phone. Fix any bugs on `fix/*` branches. | `fix/*` as needed |
| B | Production smoke test of one full game per mode. Fix any bugs on `fix/*` branches. | `fix/*` as needed |

**Exit gate (Delivery items in spec §13):**
- [ ] Production URL passes the manual checklist on current desktop and mobile browsers.
- [ ] A teammate who did not write the README sets up the project from it on a clean clone.
- [ ] `git log -p | grep -iE "service_role|sb_secret|password"` and a review of `.env*` find no committed secrets.
- [ ] The only paid service is Claude Code. Supabase Free and Cloudflare Pages Free limits were checked on launch day and recorded in the README.
- [ ] Release tag `v1.0.0` is created on `main` by C.

---

## 7. Testing Strategy

| Layer | Tool | Owner | Runs in CI |
|---|---|---|---|
| Pure logic (codes, validation, normalization, scoring reference, winners) | Vitest | Owner of each module | Yes |
| Content integrity (unique IDs, valid `correctChoiceId`, ≥10 per mode, field lengths) | Vitest | B | Yes |
| UI behavior (forms, host-only controls, submit/edit, no-leak rendering) | Vitest + React Testing Library, services mocked with `vi.mock` | Owner of each feature | Yes |
| RPC, RLS, and scoring parity against a real database | Vitest against local Supabase (`supabase start`, needs Docker), `npm run test:db` | C | Optional job. It is required locally before merging any `supabase/` PR. |
| Multiplayer and realtime | `docs/manual-test-checklist.md` with two or more browsers | Everyone, for their feature | No |

Every PR runs `npm run lint && npm run typecheck && npm test` locally before review. CI repeats these checks and adds `npm run build`.

## 8. Environments

| Environment | Frontend | Database | Used for |
|---|---|---|---|
| Local | `npm run dev` | Supabase `dev` project, or local Supabase for `test:db` | Daily development |
| Preview | Cloudflare Pages preview per PR (Phase 5 onward) | Supabase `dev` | PR review on real devices |
| Production | Cloudflare Pages `main` | Supabase `prod` | Launch |

Free-tier notes:
- Free Supabase projects pause after a period of inactivity. Open `dev` before a work session if it was idle.
- The Free plan allows two active projects, which is why there are exactly `dev` and `prod`.
- Cloudflare Pages serves `index.html` for unknown paths when there is no top-level `404.html`, so SPA routes work without extra config.

## 9. Conflict-Avoidance Rules Specific to This Plan

1. **Contracts before code.** Nobody changes `src/types/game.ts` after Phase 1 without a short proposal in chat and C making the edit on its own `chore/contract-*` branch.
2. **Only C writes to `supabase/`.** B's content changes reach the database through C running `npm run content:sync`. B tells C when a content PR merges.
3. **Only C edits `package.json`.** Phase 1 installs every dependency expected for the MVP. Ask C for anything new.
4. **No cross-feature edits.** A feature can *import* from another feature's public component (`ModePicker`, `Leaderboard`) but must not edit it.
5. **Rebase daily** while a branch is open (`git fetch origin && git rebase origin/main`). Branches should live 1–3 days.
6. **Phase boundaries are sync points.** At each exit gate, everyone pulls `main`, runs the app, and walks through the gate checklist together before branching for the next phase.
