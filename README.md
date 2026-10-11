# Party Game Generator

A browser-based, real-time multiplayer party game (trivia, word guessing, social prompts).
React + TypeScript + Vite on the frontend, Supabase (Free plan) for the database and realtime.

- Product spec: [`spec.md`](spec.md)
- Build plan and phases: [`plan.md`](plan.md), with one plan per contributor in [`plans/`](plans/)
- Branching, ownership, and review rules: [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md)

## Quick start

Prerequisites: Node 24 (see `.nvmrc`; `nvm use` picks it up) and Git.

```bash
git clone https://github.com/wilsonthebaptiste/Web_Game_Generator.git
cd Web_Game_Generator
npm install
cp .env.example .env   # then fill in the values from the Supabase dev project
npm run dev
```

The app opens at http://localhost:5173. Pages render without `.env`, but anything that talks to
Supabase shows a configuration error until it is filled in. Ask Contributor C for the `dev`
project URL and anon key. Never commit `.env`.

## Scripts

| Command                | What it does                                                           |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                                              |
| `npm run build`        | Type-check and build to `dist/`                                        |
| `npm run preview`      | Serve the production build locally                                     |
| `npm run lint`         | ESLint                                                                 |
| `npm run typecheck`    | TypeScript project check                                               |
| `npm test`             | Unit and UI tests (Vitest + React Testing Library)                     |
| `npm run test:db`      | Database tests in `tests/integration/` against local Supabase (Docker) |
| `npm run format`       | Prettier                                                               |
| `npm run content:sync` | Generate a content migration from `src/content/` (Phase 2)             |
| `npm run db:types`     | Regenerate `src/types/database.ts` from the linked Supabase project    |

Before opening a PR, run `npm run lint && npm run typecheck && npm test`. CI runs the same checks
plus `npm run build`.

Full setup, deployment, and known limitations are documented in Phase 5.
