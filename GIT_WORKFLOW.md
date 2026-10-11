# Git Workflow and Team Ownership — `GIT_WORKFLOW.md`

## 1. Purpose

This project is being built by three contributors using Claude Code. This document defines the branching, file ownership, integration, and review rules that help multiple people work in parallel without overwriting one another.

**Important:** No Git workflow can guarantee zero merge conflicts. The rules below minimize conflicts by keeping branches short-lived, assigning clear file ownership, avoiding simultaneous edits to shared files, and integrating changes frequently.

## 2. Non-Negotiable Rules

1. **Never push directly to `main`.**
2. **Never force-push to `main` or rewrite shared branch history.**
3. Each task gets its own branch, created from the latest `origin/main`.
4. One contributor owns a given file for a task. Ask before editing a file owned by someone else.
5. Keep pull requests small and focused on one feature.
6. Pull/rebase from the latest `origin/main` before opening a PR and resolve conflicts on your own feature branch.
7. Only merge after checks pass and another teammate has reviewed the change.
8. Never commit `.env`, credentials, service-role keys, access tokens, or local database secrets.
9. Do not change shared contracts (types, database schema, routes, package dependencies) without coordinating with the team first.
10. Do not combine unrelated formatting, renaming, and feature work in one PR.

## 3. Recommended Contributor Roles

Assign actual names in the team chat or replace the labels below in this document before work begins.

### Contributor A: Wilson — Room and Lobby
Owns:
- Room creation and room-code generation.
- Join-room flow and display-name validation.
- Lobby player list and host indicator.
- Room and player service functions.
- Room/lobby tests.

Primary folders:
- `src/features/home/`
- `src/features/lobby/`
- `src/services/rooms.ts`
- `src/services/players.ts`
- `src/lib/roomCodes.ts`

### Contributor B: Tahshon — Game Modes and Round Flow
Owns:
- Trivia, word guessing, and social prompt content.
- Round UI and answer input components.
- Mode-specific answer validation and scoring-rule functions.
- Round transition and reveal UI.
- Game content tests.

Primary folders:
- `src/features/game/`
- `src/content/`
- `src/services/rounds.ts`
- `src/services/answers.ts`
- Relevant game-rule modules and tests.

### Contributor C: Waliu — Integration, Data, and Delivery
Owns:
- Initial app shell, routing, shared UI primitives, and integration.
- Supabase setup, migrations/schema, RLS policies, and trusted database functions.
- Shared game/database types.
- Leaderboard and final winner screen.
- Deployment, environment setup, README, and CI checks.

Primary folders:
- `src/app/`
- `src/components/`
- `src/lib/supabaseClient.ts`
- `src/types/`
- `supabase/`
- `src/features/leaderboard/`
- Repository configuration and documentation.

**Integration lead:** Contributor C coordinates integration and schema changes. This is not permission to silently overwrite another contributor's work. Each contributor reviews changes that affect their feature.

## 4. Shared Files: Coordinate Before Editing

These files are likely to cause conflicts because many features depend on them. The designated owner should make the initial version and coordinate changes.

| File or area | Default owner | Rule |
|---|---|---|
| `package.json` and lockfile | Contributor C | Do not independently add packages. Request dependency changes; one person installs and commits the lockfile. |
| `src/app/App.tsx` and routes | Contributor C | Feature owners expose a page/component; integration lead wires it into the app. |
| `src/types/game.ts` | Contributor C, with all contributors consulted | Agree on interfaces before parallel work; avoid incompatible unilateral edits. |
| `src/types/database.ts` | Contributor C | Generated schema types or schema changes are coordinated centrally. |
| `supabase/migrations/` | Contributor C | Never edit a migration already applied/shared; create a new migration with a unique timestamp/name. |
| `src/lib/supabaseClient.ts` | Contributor C | Central owner only. Feature owners import the client or use service functions. |
| `src/components/` | Contributor C | Request shared-component changes instead of making competing edits. |
| `README.md` | Contributor C | Contributors send setup/documentation updates to the owner or make isolated changes in separate PRs. |
| `.env.example` | Contributor C | Commit placeholder variable names only, never real values. |
| `vite.config.ts`, lint/test config | Contributor C | Coordinate config changes before editing. |

If the team changes the role assignments, update this table first.

## 5. Agree on Interfaces Before Parallel Coding

Before feature implementation starts, Contributor C creates the first version of the shared types and service contracts. The other contributors review them.

At minimum, agree on:
- `Room`, `Player`, `GameMode`, `Round`, `Answer`, and `RoundResult` types.
- How a player is identified after joining and after refresh.
- The function signatures for creating a room, joining a room, starting a round, submitting an answer, revealing results, and ending a game.
- The shape of answer payloads for each game mode.
- How errors are returned or thrown.
- Which state transitions are performed by trusted backend functions versus the frontend.

A contributor can build against a mocked implementation of an agreed service contract while the real backend is being built. Do not independently invent incompatible interfaces in different branches.

Suggested contract style:

```ts
export type GameMode = "trivia" | "word-guessing" | "social";

export type RoomStatus = "lobby" | "playing" | "finished";
export type RoundStatus = "answering" | "revealed";

export interface CreateRoomInput {
  displayName: string;
}

export interface JoinRoomInput {
  roomCode: string;
  displayName: string;
}
```

This is an initial example, not a complete schema. Agree on the final definitions in `src/types/game.ts` before dependent features proceed.

## 6. Branch Naming

Use short, descriptive branch names:

- `feat/room-creation`
- `feat/join-lobby`
- `feat/trivia-round`
- `feat/word-guessing`
- `feat/social-prompts`
- `feat/scoreboard`
- `fix/answer-double-submit`
- `test/round-scoring`
- `docs/setup-readme`

One branch should represent one cohesive task. Do not have multiple contributors commit to the same feature branch.

## 7. Exact Daily Workflow

### A. Start a task

Run from the repository directory:

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/your-task-name
```

Before editing, check `git status` and ensure the working tree is clean. If you have uncommitted work, do not discard it; commit it on the appropriate branch or safely stash it first.

### B. Work only on your task

- Keep edits within your assigned folders.
- If you need to change a shared file, message its owner and agree who will make the edit.
- Commit in logical chunks with clear messages.
- Do not include another contributor's unrelated changes in your commit.

Example:

```bash
git add src/features/lobby
git commit -m "feat: add room lobby UI"
```

Review `git diff` and `git status` before every commit.

### C. Update your branch before opening a PR

First commit or otherwise safely preserve your own changes. Then:

```bash
git fetch origin
git rebase origin/main
```

If conflicts occur:
1. Stop and inspect each conflicted file.
2. Keep the intended behavior from both changes where appropriate; do not blindly choose “ours” or “theirs.”
3. Run tests and review the resulting diff.
4. Continue the rebase:

```bash
git add <resolved-file>
git rebase --continue
```

If you are unsure how to resolve a conflict, stop and ask the file owner. Do not guess at database migrations, shared types, or authorization logic.

Because the branch has not been shared with others, rebasing is appropriate. If the branch is already being used by other people, coordinate before rewriting its history.

### D. Push your feature branch

```bash
git push -u origin feat/your-task-name
```

If you rebased a branch that only you use and already pushed, a normal push may be rejected. Coordinate with the integration lead before using `git push --force-with-lease`. Never use plain `--force`.

### E. Open a pull request

- Base branch: `main`.
- Include the feature purpose, what changed, test steps/results, screenshots for UI changes where useful, and any schema/environment changes.
- Link relevant task/issues.
- Request review from at least one teammate, ideally the owner of any affected shared contract.
- Do not merge your own PR without review unless the team explicitly agrees to an emergency exception.
- Wait for CI/tests and reviewer approval.
- Resolve requested changes on the same feature branch.

### F. Merge and clean up

The integration lead merges approved PRs into `main` using the repository's chosen merge method. Use **Squash and merge** by default to keep the history easy to read, unless the team agrees otherwise.

After merging:

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/your-task-name
```

Delete the remote branch through GitHub or:

```bash
git push origin --delete feat/your-task-name
```

Start the next task from the latest `main`.

## 8. Rules for Claude Code

Each contributor using Claude Code must:
- Start by reading `spec.md`, `GIT_WORKFLOW.md`, and the relevant existing code.
- Ask Claude Code to work only on the assigned feature and avoid unrelated refactors.
- Explicitly tell Claude Code which folders/files the contributor owns.
- Tell Claude Code not to edit shared files owned by another contributor without approval.
- Review every diff; do not blindly accept generated changes.
- Run tests, lint, and type checks before committing.
- Never paste production secrets into prompts or commit them.
- Never allow Claude Code to run destructive Git commands, push directly to `main`, or resolve conflicts by discarding an entire side without review.

Suggested task prompt:

> Read `spec.md` and `GIT_WORKFLOW.md`. I own **[feature]** and may edit only **[approved paths]**. Implement **[specific acceptance criteria]**. Preserve existing interfaces. Do not modify shared types, routing, package files, database migrations, or files outside my ownership without asking first. Add tests for the behavior. Before finishing, run the relevant checks and summarize changed files, test results, and any interface changes. Do not commit, push, merge, or run destructive Git commands.

## 9. Database and Environment Coordination

- Keep migrations in `supabase/migrations/` with unique timestamped filenames.
- Never edit a migration that another teammate has already applied to a shared database. Add a new migration to change the schema.
- The integration lead applies shared migrations and communicates when the shared database schema changes.
- Use `.env.example` as the committed template and create a separate local `.env` for real values.
- `.env` must be ignored by Git. Verify with `git status --ignored` if uncertain.
- Only safe public browser configuration belongs in `VITE_` variables. Vite exposes these variables to browser code, so never put secrets in them.
- Never commit Supabase service-role keys, database passwords, access tokens, or production credentials.
- Avoid two people changing the same shared database schema at the same time.

## 10. Pull Request Checklist

Copy this checklist into each PR:

- [ ] PR is focused on one task and targets `main`.
- [ ] I worked on a feature branch, not directly on `main`.
- [ ] I checked the latest `origin/main` and resolved any conflicts.
- [ ] I stayed within my assigned files or got approval for shared-file changes.
- [ ] Shared types/service contracts remain compatible.
- [ ] Tests, lint, and type checks pass.
- [ ] Multiplayer behavior was checked in separate browser sessions when relevant.
- [ ] No secrets or local environment files are included.
- [ ] Schema/migration changes are documented and coordinated.
- [ ] README or setup instructions were updated if needed.
- [ ] A teammate reviewed the PR.

## 11. When Conflicts Happen

Do not resolve a conflict by blindly choosing one whole file version. Instead:
1. Identify what each branch was trying to change.
2. Ask the relevant file owner if the intended behavior is unclear.
3. Merge the intended behavior from both changes.
4. Run formatting, type checks, tests, and inspect the final diff.
5. Explain the resolution in the PR.

If two branches repeatedly conflict, stop parallel work on that file. Assign one person as its temporary owner, have the other contributor submit the desired change as a note or isolated patch, then resume after the owner merges it.

## 12. Definition of a Healthy Workflow

The team is following this workflow when:
- `main` always represents an integrated, runnable state.
- Every feature enters `main` through a reviewed PR.
- No one works directly on another person's branch without coordination.
- Shared contracts and migrations have explicit owners.
- Feature branches are small and short-lived.
- Conflicts are resolved on feature branches and tested before merge.
- All contributors can pull `main` and run the project using documented instructions.
