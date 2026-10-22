# Contributor C — Waliu: Integration, Data, and Delivery

Read [`../plan.md`](../plan.md) first. The phase numbers here match it. You are the integration lead: you own the shared contracts, the database, security, the leaderboard, the final screen, and deployment. You also merge approved PRs (squash and merge).

Your work is on the critical path, especially in Phases 1–2. Merge contract and RPC PRs as early as possible, and tell the team in chat each time a PR they depend on merges.

## Your files

**You own:**
- `src/app/` (`App.tsx`, `routes.tsx`, `RoomPage.tsx`, `useRoomSession.ts`, `theme.css`)
- `src/components/` (`Button`, `Input`, `LoadingState`, `ErrorMessage`, plus others as requested)
- `src/lib/supabaseClient.ts`, `src/lib/errors.ts`
- `src/types/` (`game.ts`, `database.ts`)
- `src/features/leaderboard/` (`Leaderboard.tsx`, `FinalScreen.tsx`, `winners.ts`, `leaderboard.css`)
- `src/test/` (`setup.ts`, `fixtures.ts`), `tests/integration/`
- `supabase/` (migrations, config), `scripts/` (content sync)
- `package.json`, lockfile, `vite.config.ts`, ESLint/Prettier/TS configs, `.github/workflows/`, `.env.example`, `.gitignore`, `README.md`, `docs/`

**You import from (never edit after the scaffold handoff):**
- A: `src/features/home/`, `src/features/lobby/`, `src/services/rooms.ts`, `src/services/players.ts`
- B: `src/features/game/`, `src/content/` (read by `content:sync`), `src/features/game/rules/scoring.fixtures.json`, `src/services/rounds.ts`, `src/services/answers.ts`

**Integration-lead rule:** if a teammate's file breaks integration, open an issue or send them a patch. Don't edit their file on your own branch.

---

## Phase 1 — Foundation and Contracts

Your PRs here unblock everyone. Aim to merge `chore/scaffold` on day one.

**Branch `chore/scaffold`:**
- [x] `npm create vite@latest` (React + TS). Pin Node in `.nvmrc` and `package.json#engines`.
- [x] Install every expected MVP dependency now so no one needs to change `package.json` later: `react-router-dom`, `@supabase/supabase-js`, and as dev dependencies `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `eslint` (+ react/ts plugins), `prettier`, `tsx`, `supabase` (CLI).
- [x] Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:db`, `format`, `content:sync`, `db:types`.
- [x] ESLint `no-restricted-imports`: block `src/content/**` from everything under `src/` except `src/content/` itself. (`scripts/` is outside `src/` and may import it.)
- [x] `.gitignore` (`.env`, `.env.*` except `.env.example`, `dist`, `supabase/.temp`). `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` (placeholders only).
- [x] `src/lib/supabaseClient.ts` with an `ensureAnonymousSession()` helper.
- [x] `src/app/App.tsx` + `routes.tsx`: `/`, `/join/:code`, `/room/:code`. `theme.css` with colour, spacing, and focus tokens.
- [x] `src/components/`: `Button`, `Input` (always labelled), `LoadingState`, `ErrorMessage`.
- [x] **Stub handoff files** (ownership passes to A or B on merge): `features/home/HomePage.tsx`, `features/lobby/LobbyPage.tsx`, `features/game/GamePage.tsx`, and `services/{rooms,players,rounds,answers}.ts` with agreed signatures that `throw new Error("not implemented")`.
- [x] `.github/workflows/ci.yml`: install, lint, typecheck, test, build on every PR.
- [ ] Turn on branch protection for `main` (PRs required, one approval, CI required, no force-push). Wilson owns the repo, so he has to do this.

**Branch `feat/shared-contracts`** (request review from **both** A and B):
- [x] `src/types/game.ts`: `GameMode`, `RoomStatus`, `RoundStatus`, `Room`, `Player`, `Round`, content item types per mode, `PromptSnapshot` per mode (no answer fields), `AnswerPayload` per mode, `RevealSnapshot`, `RoundResult`, `RoomSession { room, players, currentRound, me, myAnswer, connection }`, `CreateRoomInput`, `JoinRoomInput`, `AppErrorCode`, `AppError`.
- [x] `src/lib/errors.ts`: map each `AppErrorCode` to a friendly message, plus `toAppError(unknown)`.
- [x] `src/test/fixtures.ts`: `RoomSession` fixtures for lobby (host / non-host), answering (each mode, submitted / not), revealed (each mode), and finished (with a tie).
- [x] Add the ownership rows from `plan.md` §1.7 to the table in `GIT_WORKFLOW.md` §4.

**Branch `feat/initial-schema`:**
- [x] Create Supabase projects `dev` and `prod`. Enable anonymous sign-ins on both. Store credentials only in your local `.env` and a password manager.
- [x] `supabase/migrations/<ts>_initial_schema.sql`: the tables in `plan.md` §1.4, check constraints on status and mode, foreign keys, indexes (`rooms.code`, `players.room_id`, `rounds.room_id`, `answers.round_id`), and the unique constraints.
- [x] RLS enabled on **every** table. SELECT-only policies for room members on `rooms`, `players`, and `rounds`. Own rows only on `answers`. No policies on `round_secrets` or `content_items`. No client write policies anywhere.
- [x] Realtime publication for `rooms`, `players`, `rounds`.
- [x] Apply to `dev`. Run `npm run db:types` to generate `src/types/database.ts`.

**Done when:** the Phase 1 exit gate in `plan.md` passes.

---

## Phase 2 — Rooms, Lobby, and Backend Core

**Branch `feat/room-rpcs`** (merge first, because A is waiting):
- [x] `create_room(display_name)`: validate the name, generate a code from A's alphabet (retry on collision), insert the room and host player, set `host_player_id`, `expires_at = now() + interval '12 hours'`. Rate limit: no more than 5 rooms per `auth.uid()` per hour.
- [x] `join_room(code, display_name)`: fail with `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, or `ROOM_NOT_JOINABLE` (status ≠ `lobby`, unless this `auth.uid()` already joined, which is a rejoin). Fail with `NAME_TAKEN` if the name matches case-insensitively. Rate limit join attempts.
- [x] `get_room_snapshot(code)`: member only. Returns room, players, current round (with no secrets), `me`, `myAnswer`.
- [x] All RPCs are `security definer` with `set search_path = public` and `raise exception` using stable error codes. (Used `set search_path = ''`, which is stricter: every name is schema-qualified.)
- [x] Local `test:db` tests: happy paths and each error code. Written in `tests/integration/` and passing against `dev`, and against the local Docker stack since Phase 3. `ROOM_NOT_JOINABLE` is covered in `round-rpcs.test.ts`. `ROOM_EXPIRED` can't be set up from a client (rooms last 12 hours), so it is only checked in PGlite during development.

**Branch `feat/round-rpcs`:**
- [x] `scripts/sync-content.ts` (run with `tsx`): reads `src/content/*`, splits each item into `public_payload` and `answer_key`, and writes a **new** `supabase/migrations/<ts>_content_sync.sql` with idempotent upserts. Items removed from the source get `active = false`.
- [x] `start_round(room_id, mode)`: host only. Checks there are ≥2 players, the round limit, and that the previous round is revealed. Picks a random active content item for the mode that hasn't been used in this room yet. Inserts `rounds` + `round_secrets`, updates `rooms.status/current_round_id/selected_mode`.
- [x] `submit_answer(round_id, payload)`: member only. Checks the round is `answering` and the room is not `finished`. Validates the payload against the mode (mirrors B's `validateAnswerPayload`). Upserts the answer and recomputes `rounds.submission_count`.

**Branch `feat/room-session`:**
- [x] `useRoomSession(code)`: `ensureAnonymousSession` → `getRoomSnapshot` → subscribe through A's `subscribeToRoom` plus a `rounds` subscription. Refetch the snapshot on any event, so events are only notifications.
- [x] `RoomPage`: loading, error, and not-a-member states (non-members are sent to `/join/:code`). Switch views on `room.status` and pass `session` to `LobbyPage`, `GamePage`, or a placeholder for the final screen. (Built and tested with mocked services. Merged before A's services by agreement; checked end to end once `feat/room-services` merges.)

**Done when:** the Phase 2 exit gate passes. Do the console-based security checks yourself.

---

## Phase 3 — Round Loop and Trusted Scoring

**Branch `feat/reveal-scoring`** (merge first, because B is waiting):
- [x] `reveal_round(round_id)`: host only. `select … for update` on the round, `ROUND_ALREADY_REVEALED` if it isn't `answering`. Score the answers per `plan.md` §1.5 using `round_secrets`. Set `answers.points_awarded`, increment `players.score`, write `reveal_snapshot` (correct answer, every player's answer or null, points), set `status = 'revealed'` and `revealed_at`. All in one transaction.
- [x] `end_game(room_id)`: host only. Sets `status = 'finished'`.
- [x] `tests/integration/scoring.parity.test.ts`: loads B's `scoring.fixtures.json`, creates rooms, players, and answers in local Supabase, calls `reveal_round`, and checks the points. Also covers double reveal, non-host reveal, and answers submitted after the reveal.

**Branch `feat/scoreboard`** (merge before B's `feat/game-flow`):
- [x] `winners.ts`: `computeWinners(players) → Player[]` (all players tied for the top score; an empty list if there are no players).
- [x] `Leaderboard({ players, highlightPlayerId?, lastRoundPoints? })`: sorted by score, rank shown as a number, "you" marked with text, round deltas.
- [x] Vitest tests for `computeWinners` (single winner, ties, all zero). RTL tests for `Leaderboard`.

**Done when:** the Phase 3 exit gate passes and `npm run test:db` is green locally.

---

## Phase 4 — End Game, Resilience, and Hardening

**Branch `feat/final-screen`:**
- [x] `FinalScreen({ session })`: winner names ("It's a tie!" when there are several), final `Leaderboard`, and a "Create a new room" link home. Wire it into `RoomPage` for `finished`.

**Branch `feat/reconnect`:**
- [x] In `useRoomSession`: refetch the snapshot on the realtime channel `SUBSCRIBED` (including re-subscribes), on `window` `online`, and on `visibilitychange` → visible. Expose a `connection` status (`connected` / `reconnecting` / `offline`) so the UI can show a banner.
- [x] Expired or finished room on reconnect → clear message and a link home.

**Branch `test/rls-security`:**
- [x] `tests/integration/security.test.ts` with two anonymous sessions:
  - a non-member can't read the room;
  - a member can't read `round_secrets`, `content_items`, or another player's answers;
  - non-hosts can't call host RPCs;
  - nobody can insert or update tables directly;
  - a finished room rejects answers.
- [x] Access-time expiry is enforced in every RPC. If `pg_cron` is available on the Free plan, add a migration that cleans up rooms older than 24 hours. Otherwise document a manual cleanup query in the README.

**Branch `docs/manual-test-checklist`:**
- [x] `docs/manual-test-checklist.md`: spec §13 turned into step-by-step two-browser scripts (Room/Lobby, Gameplay per mode, End Game, Reconnect, Mobile). Share it with A and B.

**Done when:** the Phase 4 exit gate passes.

---

## Phase 5 — Deployment and Launch

**Branch `chore/deploy-config`:**
- [ ] Apply all migrations, including the latest content sync, to `prod` with `supabase db push`. Run `test:db` against a local reset of the same migrations first.
- [ ] Cloudflare Pages: connect the GitHub repo, production branch `main`, build `npm run build`, output `dist`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production (→ `prod`) and preview (→ `dev`) separately.
- [ ] Supabase Auth settings: add the production and preview URLs.

**Branch `docs/setup-readme`:**
- [ ] README: prerequisites, clone → `.env` → run, test commands (including `test:db` + Docker), content workflow (B edits → `content:sync` → migration), deploy steps, free-tier limits checked on launch day, known limitations (host can't be reassigned, identity is per browser, room expiry).
- [ ] Ask A or B to follow the README on a clean clone and fix whatever they get stuck on.

**Launch:**
- [ ] Secrets audit (see the `plan.md` Phase 5 gate). Confirm only free tiers are in use.
- [ ] Run the full manual checklist on production with A and B.
- [ ] Tag `v1.0.0` on `main`.

---

## Claude Code prompt template

> Read `spec.md`, `GIT_WORKFLOW.md`, `plan.md`, and `plans/contributor-c-waliu.md`. I am Contributor C (Integration, Data, and Delivery). I may edit `src/app/`, `src/components/`, `src/lib/supabaseClient.ts`, `src/lib/errors.ts`, `src/types/`, `src/features/leaderboard/`, `src/test/`, `tests/`, `supabase/`, `scripts/`, `docs/`, and repository config. Implement the **[Phase N, branch name]** checklist. Do not edit A's or B's feature or service files (except the one-time Phase 1 stubs). Never edit a migration that has already been applied; create a new one. Never put a service-role key or database password in any file. Add tests. Run `npm run lint && npm run typecheck && npm test` (and `npm run test:db` for `supabase/` changes), then summarize changed files, test results, and any contract changes the team must review. Do not commit, push, merge, or run destructive Git commands.
