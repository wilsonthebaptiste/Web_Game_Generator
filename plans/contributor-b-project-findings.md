# Contributor B project findings

Author: Tahshon (Contributor B: Game Modes and Round Flow). Covers Phase 1. Read this with [`contributor-b-tahshon.md`](contributor-b-tahshon.md) and `plan.md`.

## 1. What Phase 1 delivered

| Branch | Files | Tests |
|---|---|---|
| `feat/content-bank` | `src/content/types.ts`, `trivia.ts`, `wordGuessing.ts`, `socialPrompts.ts`, `content.test.ts` | Content integrity (59 cases) |
| `feat/scoring-rules` | `src/features/game/rules/normalize.ts`, `validatePayload.ts`, `scoring.ts`, `scoring.fixtures.json`, `scoring.test.ts`, `validatePayload.test.ts` | Fixtures, normalization, validation (55 cases) |

Each branch is based on `main` after `chore/scaffold`. The two branches don't touch any of the same files, so they can merge in either order. Each one passes `npm run lint`, `npm run typecheck`, `npm test`, `prettier --check` and `vite build`.

## 2. Content bank

- 18 items per mode, which is more than the required 15. Every mode has enough items for at least 10 rounds (spec §6).
- IDs are `trv-NNN`, `wrd-NNN`, `soc-NNN`. **Never reuse or renumber an ID.** Add new items at the end with the next number. To retire an item, delete it from the source file; `content:sync` then marks it `active = false`.
- Trivia choice IDs are `a`–`d`, unique within each question. Labels are unique within each question too.
- Word-guessing answers (`targetAnswer` and `acceptedAnswers`) are stored **already normalized** (trimmed, lowercase), and a test enforces this. The point is that the SQL scorer can compare against the stored values without having to re-normalize the key.
- Social prompts are all `vote-for-player` (plan §1.5). Only `soc-016` ("best laugh") sets `allowSelfVote: true`. All prompts were checked for safety: none ask for private information, target protected traits, bully anyone, or suggest dangerous acts.
- Length limits (`CONTENT_LIMITS` in `src/content/types.ts`): prompt ≤ 200, choice label ≤ 60, answer ≤ 60, instructions ≤ 160.

## 3. Scoring rules

| Mode | Rule as implemented |
|---|---|
| Trivia | +1 if `choiceId === correctChoiceId`. The comparison is exact and case-sensitive, and choice IDs are not trimmed. |
| Word guessing | +1 if `normalizeAnswer(text)` equals the normalized target or any accepted variant. `normalizeAnswer` = trim + lowercase. A blank guess never scores. Inner whitespace is **not** collapsed (`"ice  cream"` does not match). |
| Social | +1 to the voted player per vote. Votes for someone outside the room are ignored. Self-votes are ignored unless `allowSelfVote` is true. If `allowSelfVote` is missing, it counts as false. |

General rules:
- Every player in the room gets an entry in the result, with 0 if they didn't answer or got it wrong.
- Answers from player IDs that aren't in the room are ignored.
- Malformed payloads are ignored, not thrown.
- The scorers are reference code only. The **server** (`reveal_round`) does the real scoring, and the UI never sends points.

`validateAnswerPayload(mode, payload, context)` returns `{ ok: true, value }` or `{ ok: false, code: 'INVALID_ANSWER', reason }`:
- It strips extra fields and **trims word guesses** before they're sent.
- A word guess must be 1–60 characters **after trimming**.
- Trivia choices are checked against `context.choiceIds` when they're provided.
- Votes must name a room member. A self-vote returns `SELF_VOTE_NOT_ALLOWED` unless `allowSelfVote` is set; every other failure returns `INVALID_ANSWER`.
- The 60-character limit comes from `GAME_LIMITS.wordAnswerMaxLength` in `src/types/game.ts`.

## 4. Notes for C (SQL parity and content sync)

1. **Postgres `btrim(text)` only removes spaces.** JS `String.prototype.trim()` also removes tabs, newlines and other whitespace. The fixtures include `"\tzebra\n"`, which must score. In `reveal_round` and `submit_answer`, use something like `lower(regexp_replace(text, '^\s+|\s+$', '', 'g'))` rather than `lower(btrim(text))`.
2. Validate the word-guess length on the **trimmed** text (1–60) in `submit_answer`, to match the client.
3. **Fixture format** (`src/features/game/rules/scoring.fixtures.json`, `version: 1`). Each case has `name`, `mode`, `players`, `answerKey`, `answers[{ playerId, payload }]` and `expected`.
   - Player IDs are placeholders (`p1`, `p2`…). Map each one to a real player row.
   - An ID used in a payload but not listed in `players` (`"stranger"`) means someone outside the room. Map it to a random UUID.
   - Each case has at most one answer row per player, which matches the unique `(round_id, player_id)` constraint.
4. The self-vote fixtures put self-votes straight into `answers`, skipping `submit_answer`, which would reject them. That tests that `reveal_round` ignores them anyway (defense in depth). If the parity test inserts answers through `submit_answer`, insert those rows directly instead.
5. `answerKey` shapes: trivia `{ correctChoiceId }`, word `{ targetAnswer, acceptedAnswers? }`, social `{ allowSelfVote? }`.
6. **Content sync split.** This matches the merged `PromptSnapshot` types; add `mode` when copying into `rounds.prompt_snapshot`.
   - Trivia: `public_payload = { prompt, choices, category?, difficulty? }`, `answer_key = { correctChoiceId }`.
   - Word: `public_payload = { prompt, category? }`, `answer_key = { targetAnswer, acceptedAnswers }`.
   - Social: `allowSelfVote` is **not** secret. It belongs in `public_payload = { prompt, responseType, instructions?, allowSelfVote }` (default `false`, since `SocialPromptSnapshot.allowSelfVote` is required) so the UI can offer a self-vote and validate it. `submit_answer` and `reveal_round` also need to read it on the server.

## 5. Contract check against the merged `feat/shared-contracts`

`feat/shared-contracts` (PR #2) merged while this work was in progress, so both branches were rebased onto it.

- **Content item types:** resolved. `src/content/types.ts` now re-exports `TriviaContentItem`, `WordGuessingContentItem`, `SocialContentItem`, `TriviaChoice`, `Difficulty` and `ContentItem` from `src/types/game.ts`.
- **`PromptSnapshot`:** resolved. Trivia has `choices`, social has `allowSelfVote` and `instructions`, and none of the snapshots carry answers.
- **Error codes:** resolved. `INVALID_ANSWER`, `SELF_VOTE_NOT_ALLOWED`, `ROUND_NOT_ANSWERING`, `ROUND_ALREADY_REVEALED`, `ROUND_LIMIT_REACHED`, `NO_CONTENT_AVAILABLE` and `NOT_HOST` all exist. `validateAnswerPayload` now uses `SELF_VOTE_NOT_ALLOWED`.
- **Still open: `getMyAnswer(roundId)`.** Phase 3 of B's plan asks for it, but `src/services/answers.ts` only has `submitAnswer`. Proposal: drop it from B's plan and use `RoomSession.myAnswer` plus `session.refresh()` after a submit, rather than adding a new RPC.
- `RoundResult.isCorrect` has to be set by `reveal_round`: `pointsAwarded > 0` for trivia and word guessing, and `null` for social. The reference scorers return points only, so the fixtures don't cover `isCorrect`.
- `AnswerPayload` is an untagged union, so it only makes sense together with `round.mode`. That's fine because `validateAnswerPayload` takes the mode.

## 6. Environment findings

- The project needs **Node 24** (`.nvmrc`, `engines`). Under Node 21, Vitest 5 crashes on startup with `ERR_INVALID_ARG_VALUE` from `util.styleText`. Fix it by installing Node 24 LTS (`winget install OpenJS.NodeJS.LTS`).
- Under Node 21's older npm, `npm ci` on Windows didn't install `@rolldown/binding-win32-x64-msvc`, which caused the "Cannot find native binding" error. With Node 24's npm, a clean `rm -rf node_modules && npm ci` works and no workaround is needed.
- `npm ci` warns that some packages' install scripts aren't approved yet. Tests and the build work without them.
- **`main` is currently red (not caused by B).** PR #3 renamed `INVALID_DISPLAY_NAME` to `NAME_INVALID` in `src/types/game.ts`, but `src/lib/validation.ts` (A) still returns `'INVALID_DISPLAY_NAME'`. Result: `npm run typecheck` fails at `src/lib/validation.ts:45` and one test in `src/lib/validation.test.ts` fails. Every open PR, B's included, will show red CI until A fixes that line. B's own files pass lint, typecheck and tests.

## 7. Phase 1 status

- [x] `feat/content-bank` work done and committed
- [x] `feat/scoring-rules` work done and committed
- [x] Check B's work against the merged `feat/shared-contracts` contract (§5). One item is still open: `getMyAnswer`.
- [ ] Confirm the §1.5 payloads and scoring rules with C (use §3–4 above)
- [ ] Both PRs merged, and C told that the fixtures are ready for the SQL parity test and the content is ready for `content:sync`
