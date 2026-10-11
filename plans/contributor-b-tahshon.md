# Contributor B — Tahshon: Game Modes and Round Flow

Read [`../plan.md`](../plan.md) first. The phase numbers here match it. Your work covers spec §2.3–2.5, the round and results screens in §5, §6 (content and rules), and the gameplay acceptance criteria in §13.

## Your files

**You own (edit freely on your branches):**
- `src/features/game/` (`GamePage.tsx`, `RoundView.tsx`, `ResultsView.tsx`, `ModePicker.tsx`, `game.css`, per-mode input components, tests)
- `src/features/game/rules/` (normalization, payload validation, scoring reference, `scoring.fixtures.json`)
- `src/content/` (`trivia.ts`, `wordGuessing.ts`, `socialPrompts.ts`, content tests)
- `src/services/rounds.ts`, `src/services/answers.ts`

**You import from (never edit):**
- `src/types/game.ts`: `GameMode`, `Round`, `RoundStatus`, `PromptSnapshot`, `AnswerPayload`, `RevealSnapshot`, `RoundResult`, `RoomSession`, `AppError`
- `src/lib/supabaseClient.ts`, `src/lib/errors.ts`, `src/components/*`, `src/test/fixtures.ts` (C)
- `src/features/leaderboard/Leaderboard.tsx` (C), `src/services/rooms.ts` → `endGame` (A)

**Never edit:** `src/app/`, `src/types/`, `supabase/`, `scripts/`, `package.json`, configs, `src/features/home/`, `src/features/lobby/`, `src/features/leaderboard/`.

**Important rule:** UI code in `src/features/` must **never import `src/content/`**. If it did, the correct answers would ship in the browser bundle. The UI gets prompts only from `round.prompt_snapshot`. An ESLint rule will block this import.

**What you deliver to others:**
- To C: `src/content/*` (C's `content:sync` script turns it into a migration) and `rules/scoring.fixtures.json` (C's SQL `reveal_round` must pass every case).
- To A: `ModePicker` and `startRound`.

---

## Phase 1 — Foundation and Contracts

**Wait for:** C's `chore/scaffold` to merge before branching.

**Before the scaffold merges (no branch needed):**
- [ ] Review C's `feat/shared-contracts` PR, focusing on the content item types, `PromptSnapshot` per mode (with no answers in it), `AnswerPayload` per mode, `RevealSnapshot`/`RoundResult`, `RoundStatus`, and the signatures in `rounds.ts` and `answers.ts`.
- [ ] Confirm the payload shapes and scoring rules in `plan.md` §1.5 with C.

**Branch `feat/content-bank`:**
- [ ] `src/content/trivia.ts`: ≥15 items `{ id, type: "trivia", prompt, choices: [{ id, label }], correctChoiceId, category?, difficulty? }`.
- [ ] `src/content/wordGuessing.ts`: ≥15 items `{ id, type: "word-guessing", prompt, targetAnswer, acceptedAnswers? }`.
- [ ] `src/content/socialPrompts.ts`: ≥15 items `{ id, type: "social", prompt, responseType: "vote-for-player", instructions?, allowSelfVote? }`.
- [ ] Use stable, prefixed IDs (`trv-001`, `wrd-001`, `soc-001`) and never reuse or renumber one.
- [ ] Safety review against spec §6: no private information, protected traits, bullying, or dangerous acts. Social prompts should be playful ("most likely to win a dance-off").
- [ ] Content tests: unique IDs across all modes, `correctChoiceId` exists in `choices`, ≥10 items per mode, prompt and answer length limits, no blank strings.

**Branch `feat/scoring-rules`:**
- [ ] `rules/normalize.ts`: `normalizeAnswer(text)` = trim + lowercase. Don't add fuzzy matching.
- [ ] `rules/validatePayload.ts`: `validateAnswerPayload(mode, payload, context)`. Word guesses are 1–60 characters. Votes must name a player in the room, and not yourself unless the prompt allows it.
- [ ] `rules/scoring.ts`: reference functions `scoreTrivia`, `scoreWordGuess`, `scoreSocialVotes`. These document the rules and drive the client-side checks. The **server** does the real scoring.
- [ ] `rules/scoring.fixtures.json`: golden cases (input answers + answer key → expected points per player). Include whitespace, case, accepted variants, no-answer, self-vote, and ties.
- [ ] Vitest tests that run every fixture through the reference functions.

**Done when:** both PRs are merged and you've told C that the fixtures are ready for the SQL parity test.

---

## Phase 2 — Rooms, Lobby, and Backend Core

You build UI against the fixtures while C builds the round RPCs.

**Branch `feat/mode-picker`** (merge this early, because A's lobby depends on it):
- [ ] `ModePicker({ value, onChange, disabled })`: three modes with a short description each. Use radio-group semantics so it works from the keyboard.
- [ ] RTL test: selection and keyboard navigation.

**Branch `feat/round-view`:**
- [ ] `RoundView({ session })`: round number, mode label, prompt from `prompt_snapshot`, and the mode-specific input:
  - `TriviaChoices`: radio choices.
  - `WordGuessInput`: text field with a character counter.
  - `PlayerVote`: list of other players (or all players if `allowSelfVote`).
- [ ] Submission status: "Answer submitted ✓ (you can change it until the host reveals)" or "Waiting for reveal", plus the submitted count `submission_count / players.length`.
- [ ] `ResultsView({ session })`: correct answer or outcome, each player's answer ("No answer" if missing), and points this round, all from `reveal_snapshot`. Leave a slot for C's `Leaderboard`.
- [ ] Build against `src/test/fixtures.ts`. Calls go to the stubbed services for now.
- [ ] RTL tests: each mode renders. **Before the reveal, no other player's answer appears anywhere in the DOM.** After the reveal, missing answers show "No answer".

**Done when:** all three modes render from fixtures with passing tests.

---

## Phase 3 — Round Loop and Trusted Scoring

**Wait for:** C's `feat/reveal-scoring` before `feat/round-services`, and C's `feat/scoreboard` before `feat/game-flow`.

**Branch `feat/round-services`** (merge early, because A's Start button depends on it):
- [ ] `services/rounds.ts`: `startRound(roomId, mode)`, `revealRound(roundId)`, calling the RPCs.
- [ ] `services/answers.ts`: `submitAnswer(roundId, payload)` (the server upserts, so editing reuses this call) and `getMyAnswer(roundId)`.
- [ ] Convert errors to `AppError` (`NOT_HOST`, `ROUND_NOT_ANSWERING`, `ROUND_ALREADY_REVEALED`, `INVALID_ANSWER`, `ROUND_LIMIT_REACHED`, `NO_CONTENT_AVAILABLE`).
- [ ] Tests with a mocked supabase client.
- [ ] Tell A when this merges.

**Branch `feat/game-flow`:**
- [ ] `GamePage({ session })` switches between `RoundView` and `ResultsView` based on `currentRound.status`.
- [ ] Submit and edit: validate with `validateAnswerPayload` before sending, disable the button while a request is in flight, and confirm the submission on success.
- [ ] Host controls: "Lock & reveal" (disabled while in flight, so a double click can't fire twice). On results: `ModePicker` + "Next round", and "End game" using A's `endGame`. Hide "Next round" once `round_number === round_limit`.
- [ ] Non-hosts never render host controls. The backend also rejects them, but don't rely on that alone.
- [ ] Embed C's `Leaderboard` in `ResultsView`.
- [ ] RTL tests: the double-submit guard, host vs non-host controls, the edit-then-locked flow.

**Done when:** the Phase 3 exit gate in `plan.md` passes for all three modes in two or more browsers.

---

## Phase 4 — End Game, Resilience, and Hardening

**Branch `fix/game-polish`:**
- [ ] Mobile layout at 360px wide. Large answer targets. A prompt that can be read from across a room.
- [ ] Correct and incorrect answers shown with an icon and text ("✓ Correct" / "✗ Incorrect"), not only color.
- [ ] Focus management: move focus to the new prompt when a round starts and to the results heading on reveal.
- [ ] States for when the round changes under you (the host revealed while you were typing) and for a failed submission.

**Branch `test/round-ui`:**
- [ ] Fill gaps in RTL coverage for `GamePage`, `RoundView`, and `ResultsView`.

**Content review:** play through every content item once. Fix typos and ambiguous answers on a `fix/content-*` branch, then tell C so they can run `content:sync`.

**Manual check:** run the Gameplay section of `docs/manual-test-checklist.md` on a phone and a desktop.

---

## Phase 5 — Deployment and Launch

- [ ] On the production URL, play one full game per mode with two or more devices, including an edit before the reveal and a missing answer.
- [ ] Fix any issues on `fix/<short-name>` branches inside your own folders.
- [ ] Send notes on adding new content (ID rules, sync step) to C for the README.

---

## Claude Code prompt template

> Read `spec.md`, `GIT_WORKFLOW.md`, `plan.md`, and `plans/contributor-b-tahshon.md`. I am Contributor B (Game Modes and Round Flow). I may edit only `src/features/game/`, `src/content/`, `src/services/rounds.ts`, and `src/services/answers.ts`. Implement the **[Phase N, branch name]** checklist. Use the types in `src/types/game.ts` as they are. UI code must never import from `src/content/`. Do not modify shared types, routing, components, package files, configs, `scripts/`, or `supabase/`. If you need a change there, stop and tell me what to request. Add tests. Run `npm run lint && npm run typecheck && npm test`, then summarize changed files, test results, and any interface concerns. Do not commit, push, merge, or run destructive Git commands.
