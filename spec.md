# Party Game Generator — `spec.md`

## 1. Product Overview

**Working name:** Party Game Generator  
**Product type:** Browser-based, real-time multiplayer party game  
**Primary goal:** Let a friend group start playing quickly without installing an app or creating accounts.

One player creates a room and acts as the host. Other players join using a short room code. The host selects a game mode, starts rounds, and reveals results. The application tracks scores and announces the winner when the game ends.

The experience should feel fast, playful, readable from across a room, and resilient when a player refreshes or briefly loses connection.

## 2. MVP Scope

### Required features

1. **Create a room**
   - A visitor can create a new room.
   - The application generates a unique, easy-to-read room code.
   - The creator becomes the host.
   - The host receives a shareable room code and join link.
   - A room has a defined lifecycle: lobby → playing → finished.

2. **Join a room**
   - Players enter a room code and a display name.
   - Invalid or expired room codes produce a clear error.
   - Duplicate display names in one room should be handled with a validation message or a simple disambiguation rule.
   - The lobby shows the players who have joined.
   - The host is visibly identified.

3. **Choose a game mode**
   - **Trivia:** a question with a set of answer choices; players submit an answer.
   - **Word Guessing:** players guess a target word from a clue. For the MVP, use a simple shared prompt and text answers rather than complex drawing or clue-giving mechanics.
   - **Social Prompts:** a prompt for the group, such as “Who in this room is most likely to…?” Players submit a vote or response according to the prompt's instructions.
   - Content is selected from a curated, bundled question/prompt bank. No paid AI API or other paid runtime service is required.
   - The host can choose a mode and start the next round.

4. **Submit answers**
   - Each connected player can submit one answer per round.
   - A player can edit their answer until the round is locked.
   - The interface indicates whether an answer has been submitted.
   - The application must not reveal other players' answers before the reveal phase.
   - The host can end answer submission and reveal results. If a timer is implemented, it is optional and must not block the core flow.

5. **Reveal results**
   - Once the round is locked, the app reveals submitted answers and the correct answer or round outcome, as applicable.
   - Players who did not submit are shown as having no answer.
   - For trivia, award points for correct answers.
   - For word guessing, use a simple MVP scoring rule: award points when the submitted answer matches the target after trimming whitespace and comparing without case sensitivity. Do not imply sophisticated semantic matching.
   - For social prompts, use a transparent rule defined by the prompt type. For voting prompts, award a point to the selected player for each vote received. Avoid prompts that require an objectively “correct” answer.

6. **Scoring**
   - Scores persist between rounds within the active room.
   - The leaderboard displays player names and current scores.
   - Scores update for everyone in the room after a round is revealed.
   - The score calculation is performed by trusted server-side logic (for example, a Supabase database function or carefully controlled database operation), not accepted blindly from a browser client.
   - A player cannot award themselves arbitrary points by editing a client request.

7. **Finish and winner**
   - The host can end the game, or the game can end after a configurable number of rounds.
   - The final screen shows the winner and final leaderboard.
   - If players tie for the highest score, show all tied winners.
   - The host can start a new room. Resetting/replaying the current room is optional and must not complicate the MVP.

### Explicitly out of scope for MVP

- User accounts, profiles, friend lists, and persistent cross-game statistics.
- Voice or video chat.
- Payments, subscriptions, advertisements, and in-app purchases.
- AI-generated questions at runtime or any paid third-party API.
- Custom game creation by players.
- Images, drawing canvases, and media uploads.
- Spectator mode, teams, tournaments, and matchmaking.
- Complex anti-cheat systems.
- Native mobile apps. The website should be responsive on phones and desktops.

## 3. Suggested Free-Tier Technology Stack

Use the following stack unless the team agrees to a documented change before implementation.

- **Frontend:** React + TypeScript + Vite.
- **Styling:** plain CSS or CSS Modules. Pick one convention and keep it consistent.
- **Backend/data/realtime:** Supabase Free plan (Postgres, Realtime, and database functions/RPC where needed).
- **Hosting:** Cloudflare Pages Free or another agreed free static-hosting tier compatible with the project.
- **Version control:** Git + GitHub.
- **Development assistant:** paid Claude Code subscription.
- **Game content:** static TypeScript/JSON data files committed to the repository.
- **Testing:** Vitest for unit tests; React Testing Library for important UI behavior; a small manual multiplayer test checklist for realtime flows.

**Cost constraint:** Claude Code is the only intended paid component. Do not introduce paid APIs, paid hosting, paid database features, or paid monitoring tools. Free-tier quotas and policies can change; verify current limits before launch. The MVP should remain usable without any runtime LLM call.

**Security note:** Supabase's public/anon key is intended for browser use when Row Level Security (RLS) is correctly configured. Never put a Supabase service-role key, database password, or other privileged secret in frontend code or a committed file.

## 4. Core User Journeys

### Journey A — Host creates a game

1. Visitor opens the home page.
2. Selects **Create Room**.
3. Enters a display name.
4. App creates a room and assigns the visitor as host.
5. Host sees the lobby, room code, copyable join link, and player list.
6. Host selects a game mode and starts the first round.
7. Host locks submissions and reveals results.
8. Scores update.
9. Host starts another round or ends the game.
10. Final leaderboard and winner are shown.

### Journey B — Player joins and plays

1. Visitor opens the home page or a shared join link.
2. Enters the room code if it was not prefilled.
3. Enters a display name and joins.
4. Lobby updates in real time.
5. Player sees the current round and submits an answer.
6. Player sees confirmation that the answer was received.
7. After the host reveals results, the player sees the outcome and updated score.
8. Player continues until the game ends.

### Journey C — Reconnect

1. A player refreshes or briefly loses network connectivity.
2. The app attempts to reconnect to the room's realtime updates.
3. It reloads authoritative room, player, round, answer-status, and score data.
4. The player can continue if the room is still active.
5. If the room has expired or ended, the app explains that state clearly.

## 5. Pages and UI States

### Home page
- Product name and short explanation.
- **Create Room** action.
- **Join Room** form with room code.
- Friendly validation and loading/error states.

### Lobby
- Room code and copy/share link.
- Player list and host indicator.
- Game-mode selection visible to the host.
- Start Game button enabled only when the room meets the chosen minimum player count.
- Non-host players see a waiting state.
- Suggested MVP minimum: 2 players. If the host is also playing, the host counts as a player.

### Round screen
- Round number and selected game mode.
- Prompt/question and answer controls.
- Submission status, such as “Answer submitted” or “Waiting for reveal”.
- Host-only controls for locking submissions and revealing results.
- No answer leakage before reveal.

### Results screen/state
- Prompt and revealed answers.
- Correct answer or round outcome, where applicable.
- Points awarded this round.
- Updated leaderboard.
- Host controls to continue or end the game.

### Final screen
- Winner(s), including tie handling.
- Final leaderboard.
- Option to return home and create a new room.

### Global UX requirements
- Responsive layout for mobile and desktop.
- Clear loading, empty, validation, permission, network, and room-expired states.
- Keyboard-accessible controls, visible focus states, sensible color contrast, and form labels.
- Do not rely on color alone to communicate answer correctness or player status.
- Prevent accidental double submission and duplicate score awards.

## 6. Game Rules and Content Model

Keep game content data-driven so adding questions does not require changing the round engine.

### Trivia
Each trivia item should contain:
- Stable `id`
- `type: "trivia"`
- `prompt`
- `choices` with stable choice IDs and visible labels
- `correctChoiceId`
- Optional `category` and `difficulty`

MVP scoring: one point for a correct answer. All players receive the same question. Do not reveal the correct choice until the host reveals the round.

### Word guessing
Each word item should contain:
- Stable `id`
- `type: "word-guessing"`
- `prompt` or clue
- `targetAnswer`
- Optional accepted answer variants

MVP scoring: one point for an exact normalized match. Normalization may trim leading/trailing whitespace and ignore case. Do not implement fuzzy or AI-based judging in the MVP.

### Social prompts
Each prompt should contain:
- Stable `id`
- `type: "social"`
- `prompt`
- `responseType`, such as `vote-for-player` or `free-text`
- Optional instructions

For `vote-for-player`, a player selects another player; prevent self-voting unless a particular prompt explicitly allows it. The selected player receives one point per vote. For free-text prompts, the host may reveal answers, but automatic scoring is not required; define whether the round is unscored or host-awarded before implementation. To keep the MVP deterministic, prefer vote-based social prompts for scoring.

### Content quality and safety
- Include enough bundled content to test at least 10 rounds per mode.
- Avoid prompts that require users to reveal private information, target protected traits, bully a specific player, or perform dangerous/illegal acts.
- Keep content editable in a single well-defined content directory.
- Show a “skip prompt” option only if the team can implement it without compromising round state; otherwise leave it out of MVP.

## 7. Room and Round State Machine

Use explicit state values rather than inferring state from unrelated booleans.

### Room status
- `lobby`: players may join; host can select a mode and start.
- `playing`: a round is active.
- `finished`: game has ended and final scores are visible.

### Round status
- `answering`: eligible players can submit or edit their answer.
- `revealed`: submissions are locked and results are visible.

Recommended transition flow:

`lobby → playing/answering → playing/revealed → playing/answering → … → finished`

Starting another round creates a new round record and increments the round number. A revealed round must not be scored twice. Only the host may trigger host-only transitions. If the host disconnects, do not silently assign host to another player in the MVP; show a clear recovery path or document the limitation.

## 8. Suggested Data Model

The exact schema may be refined during setup, but preserve these concepts and relationships.

### `rooms`
- `id` — internal UUID
- `code` — unique, short, human-readable room code
- `host_player_id`
- `status` — `lobby`, `playing`, or `finished`
- `selected_mode`
- `current_round_id` (nullable)
- `round_limit` (optional, with a reasonable default)
- `created_at`, `updated_at`

### `players`
- `id` — UUID
- `room_id`
- `display_name`
- `score` — integer, default 0
- `is_host` or an authoritative host reference on the room
- `joined_at`
- Optional session/reconnect token stored securely enough for the selected design

### `rounds`
- `id` — UUID
- `room_id`
- `round_number`
- `mode`
- `content_id`
- `status` — `answering` or `revealed`
- `prompt_snapshot` or equivalent stable snapshot so a content update does not change an active round
- `created_at`, `revealed_at`
- Unique constraint on `(room_id, round_number)`

### `answers`
- `id` — UUID
- `round_id`
- `player_id`
- `answer_payload` — structured JSON or a mode-specific representation
- `submitted_at`
- `points_awarded` — integer, initially 0
- Unique constraint on `(round_id, player_id)` so each player has one answer per round

Use foreign keys and appropriate indexes. Define RLS policies for every exposed table. Avoid trusting a client-provided `is_host`, score, or room status. Host authorization must be checked against trusted room/player state.

## 9. Realtime and Data Integrity

- Use Supabase Realtime subscriptions to update lobby membership, round status, answer-submission counts, and scores.
- Treat the database as the source of truth; realtime messages are notifications, not the sole source of state.
- On joining or reconnecting, fetch a fresh snapshot before relying on subsequent events.
- Make host actions and score awards atomic where possible.
- A reveal operation should lock the round, evaluate eligible answers, award points once, and change the round state as one trusted operation.
- Validate room codes, names, answer lengths, mode values, and state transitions on the backend.
- Rate-limit or otherwise constrain room creation and join attempts to reduce accidental abuse.
- Set a room-expiration/cleanup policy suitable for the free tier. If scheduled cleanup is not available on the selected plan, implement a safe age check when a room is accessed and document any manual cleanup needed.
- Do not expose unrevealed correct answers or private answer payloads to other players through database queries or realtime subscriptions. Design RLS and query shapes to enforce this, not just hide answers in the UI.

## 10. Identity and Authorization

No full account system is required. Each player still needs a stable identity for the duration of a game.

Before implementation, choose and document a minimal identity strategy, such as a per-player session token or Supabase anonymous authentication if supported and appropriate. Do not rely solely on a user-editable player ID in local storage as proof of identity.

Required authorization rules:
- A player can only submit an answer as their own player identity.
- A player can only join an active room that accepts joins.
- Only the host can start rounds, lock/reveal rounds, or end the game.
- A player cannot edit another player's answer.
- A round cannot be scored more than once.
- A finished room cannot accept new answers.
- Privileged service credentials must only be used server-side and must never be sent to the browser.

If the selected free-tier architecture cannot enforce these rules safely, simplify the implementation or add a small trusted server-side function within the free-tier limits. Do not ship with open write policies on all tables.

## 11. Proposed Frontend Structure

Use a feature-oriented structure to reduce Git conflicts between contributors.

```text
src/
  app/
    App.tsx
    routes.tsx
  components/
    Button.tsx
    Input.tsx
    LoadingState.tsx
    ErrorMessage.tsx
  features/
    home/
      HomePage.tsx
      home.css
    lobby/
      LobbyPage.tsx
      lobby.css
    game/
      GamePage.tsx
      RoundView.tsx
      ResultsView.tsx
      game.css
    leaderboard/
      Leaderboard.tsx
      leaderboard.css
  lib/
    supabaseClient.ts
    roomCodes.ts
    validation.ts
  services/
    rooms.ts
    players.ts
    rounds.ts
    answers.ts
  types/
    game.ts
    database.ts
  content/
    trivia.ts
    wordGuessing.ts
    socialPrompts.ts
  test/
```

This is a suggested starting point, not a requirement to create every file immediately. Keep UI components separate from database operations and game-rule functions. Avoid putting the whole application in one component.

## 12. Error Handling

Handle at least:
- Empty or invalid display name.
- Invalid or nonexistent room code.
- Room is full, finished, or no longer joinable (if a room capacity is implemented).
- Room code collision during creation.
- Duplicate answer submission or answer update after reveal.
- Non-host attempting a host action.
- Network disconnect and reconnect.
- Host attempting to reveal a round that has already been revealed.
- Missing content item or unsupported game mode.
- Backend quota/unavailable service errors.

Errors should be understandable to players and must not expose secrets or raw database internals.

## 13. Testing and Acceptance Criteria

### Room and lobby
- [ ] A user can create a room and receives a unique room code.
- [ ] Another browser/device can join with that code.
- [ ] An invalid code gives a friendly error.
- [ ] Lobby player lists update for all connected participants.
- [ ] Host-only controls are not available to non-hosts, and backend authorization rejects unauthorized attempts.

### Gameplay
- [ ] The host can choose each of the three game modes.
- [ ] The host can start a round and all players see the same prompt.
- [ ] A player can submit one answer and see confirmation.
- [ ] An answer can be edited before reveal but not after reveal.
- [ ] Other players cannot read unrevealed answers.
- [ ] Host reveal shows results and applies the documented scoring rule.
- [ ] Refreshing the page does not silently erase authoritative room state or scores.
- [ ] A round cannot award points twice.

### End game
- [ ] Scores carry across multiple rounds.
- [ ] The host can end the game.
- [ ] The final screen shows the leaderboard and winner.
- [ ] Tied top scores show multiple winners.

### Delivery
- [ ] The app works on current desktop and mobile browsers.
- [ ] A new developer can run it using the README instructions.
- [ ] No secrets are committed.
- [ ] The deployed app uses only the agreed free-tier services, aside from the Claude Code subscription.
- [ ] Automated tests cover score normalization/scoring and core state-transition rules.

## 14. Definition of Done

A feature is done when:
1. It satisfies its acceptance criteria.
2. It has appropriate loading, error, and empty states.
3. Important logic has automated tests.
4. It follows the agreed folder and ownership boundaries in `GIT_WORKFLOW.md`.
5. It has been tested locally with at least two separate browser sessions for multiplayer behavior where relevant.
6. It does not introduce paid runtime services or commit secrets.
7. It is merged to `main` through the agreed review process.
8. Relevant README/setup documentation is updated.

## 15. Implementation Order

1. Repository setup, linting/formatting, environment template, and hosting/database project setup.
2. Room creation and joining, player identity, and lobby realtime updates.
3. Round/content types and mode selection.
4. Answer submission and reveal flow.
5. Trusted scoring and leaderboard.
6. End-game/winner screen.
7. Mobile polish, reconnect handling, tests, and deployment.

This order is a dependency guide, not a requirement that one person implement the whole project. Contributors should work in parallel on the separated features defined in `GIT_WORKFLOW.md`.
