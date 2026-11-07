# Party Game Generator

A browser-based, real-time multiplayer party game (trivia, word guessing, social prompts).
React + TypeScript + Vite on the frontend, Supabase (Free plan) for the database and realtime,
Cloudflare Pages (Free plan) for hosting.

**Play it:** https://web-game-generator.pages.dev

- Product spec: [`spec.md`](spec.md)
- Build plan and phases: [`plan.md`](plan.md), with one plan per contributor in [`plans/`](plans/)
- Branching, ownership, and review rules: [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md)
- Lessons learned and conventions: [`docs/dev-notes.md`](docs/dev-notes.md)
- Manual test checklist: [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md)

## Quick start

Prerequisites: Node 24 (see `.nvmrc`; `nvm use` picks it up) and Git. Docker Desktop is only
needed for the database tests.

```bash
git clone https://github.com/wilsonthebaptiste/Web_Game_Generator.git
cd Web_Game_Generator
npm install
cp .env.example .env   # then fill in the two values (see below)
npm run dev
```

The app opens at http://localhost:5173. To play with other people on your network (for example
a phone), run `npm run dev -- --host` and open the "Network" address it prints.

**`.env`:** both values come from the Supabase `dev` project and are public (they end up in the
browser anyway). Ask Contributor C for the publishable key.

```bash
VITE_SUPABASE_URL=https://nlpqfmsijyeyhfvssain.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # copy the whole key, including the prefix
```

Pages render without `.env`, but anything that talks to Supabase shows a configuration error
until it's filled in. Never commit `.env`, and never put a `sb_secret_` or `service_role` key in
it. Local development always uses `dev`, never `prod`.

To test multiplayer on one computer, use separate browser identities (a normal window, a private
window, and a different browser). Two tabs in the same window are the same player.

## Scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                                           |
| `npm run build`        | Type-check and build to `dist/`                                     |
| `npm run preview`      | Serve the production build locally                                  |
| `npm run lint`         | ESLint                                                              |
| `npm run typecheck`    | TypeScript project check                                            |
| `npm test`             | Unit and UI tests (Vitest + React Testing Library)                  |
| `npm run test:db`      | Database tests in `tests/integration/` (see below)                  |
| `npm run format`       | Prettier                                                            |
| `npm run content:sync` | Generate a content migration from `src/content/`                    |
| `npm run db:types`     | Regenerate `src/types/database.ts` from the linked Supabase project |

Before opening a PR, run `npm run lint && npm run typecheck && npm test`. CI runs the same checks
plus `npm run build` on every PR.

## Database tests

`npm run test:db` runs the RPC, security, and scoring parity tests against a real Supabase
instance. Use the local stack, which needs Docker Desktop running:

```bash
npx supabase start   # first run downloads the images; applies all migrations
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_TEST_URL=$API_URL SUPABASE_TEST_ANON_KEY=$ANON_KEY \
  SUPABASE_TEST_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm run test:db
npx supabase stop    # when done
```

These commands are for Git Bash or another POSIX shell. After pulling new migrations, run
`npx supabase db reset` to rebuild the local database from scratch.

The service-role key printed by `supabase status` is for the local stack only. Tests can also
run against `dev` with just the URL and publishable key, but hosted projects allow 30
anonymous sign-ins per hour, and the expired-room test is skipped.

## Database changes

The schema lives in `supabase/migrations/`. Every change is a new migration file; never edit
one that has already been applied anywhere. Contributor C applies migrations:

1. Test locally: `npx supabase db reset`, then `npm run test:db`.
2. Apply to `dev`: `npx supabase db push` (the CLI stays linked to `dev`), then
   `npm run db:types` and commit the regenerated types.
3. Apply to `prod` at release time: link to `prod`, `npx supabase db push --dry-run`, push, then
   link back to `dev`.

Rules that keep it secure (details in [`docs/dev-notes.md`](docs/dev-notes.md#supabase)):
browsers can only read, and only their own rooms; every write goes through a security-definer
RPC; answer keys stay in `round_secrets`, which browsers can't read.

## Content workflow

Questions and prompts live in `src/content/` (owned by Contributor B), but the game reads them
from the database.

1. B edits `src/content/*.ts`, opens a PR with "needs content:sync" in the title or
   description, and merges it.
2. C runs `npm run content:sync`, which writes a new `supabase/migrations/<timestamp>_content_sync.sql`
   (or prints "Content unchanged").
3. C reviews it, commits it, and applies it like any other migration.

Until step 3, players still see the old content. Removed items are deactivated, not deleted. Never
reuse an old ID for a different question.

## Deployment

- **Frontend:** Cloudflare Pages project `web-game-generator` (Direct Upload, on Contributor C's
  Cloudflare account). Every push to `main` that passes CI is built against `prod` and deployed
  by the `deploy` job in `.github/workflows/ci.yml`. It needs the `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` repo secrets. There are no preview deploys; test PRs locally.
- **Database:** Supabase projects `party-game-dev` (development and tests) and `party-game-prod`
  (the live site). Migrations reach `prod` only when C pushes them.
- **Build-time config:** the `prod` URL and publishable key are set in the deploy job. Changing
  them means a new build, not a Cloudflare setting.

If CI can't deploy, a manual deploy works: build with the two `VITE_*` values from the deploy
job, then upload `dist` under "Create deployment" in the Cloudflare dashboard.

## Free-tier limits

Everything runs on free plans. Checked on 2026-11-07; check again on launch day, because they
change.

| Service           | Limit that matters                                                        |
| ----------------- | ------------------------------------------------------------------------- |
| Supabase          | 2 active projects (we use both); 500 MB database per project; 5 GB egress |
| Supabase Auth     | 50,000 monthly active users; 30 anonymous sign-ins per hour per IP        |
| Supabase Realtime | 200 concurrent connections; 2 million messages per month                  |
| Cloudflare Pages  | 500 builds per month; 20,000 files; 25 MiB per file; no bandwidth limit   |

**Supabase pauses a Free project after a week without activity.** If the site suddenly can't
connect, open the Supabase dashboard, select the project, and click **Restore project**. It takes
a couple of minutes, and nothing is lost if it's restored within 90 days. Before a demo, open the
dashboard the day before and make sure `party-game-prod` is active.

## Known limitations

- **Identity lives in the browser.** Clearing site data or switching device makes you a new
  player, so you can't get back into a room you'd joined.
- **The host isn't replaced.** If the host leaves for good, the game can't continue.
- **Rooms expire** 12 hours after creation and are deleted after 24 hours.
- **No room size limit** (the spec makes capacity optional).
- **Ending the game during a round** leaves that round unscored.
