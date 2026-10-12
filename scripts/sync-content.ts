// `npm run content:sync` (plan.md §1.3): turns src/content/ into a new migration in
// supabase/migrations/. Run it after B's content PR merges, review the file, then apply it with
// `npx supabase db push`. Never edit an applied content migration; run this again instead.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { socialPromptItems } from '../src/content/socialPrompts'
import { triviaItems } from '../src/content/trivia'
import { wordGuessingItems } from '../src/content/wordGuessing'
import { buildContentSyncSql, migrationTimestamp } from './contentSync'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations')
const SUFFIX = '_content_sync.sql'

const sql = buildContentSyncSql([...triviaItems, ...wordGuessingItems, ...socialPromptItems])

const previous = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(SUFFIX))
  .sort()
  .at(-1)

if (previous && readFileSync(join(MIGRATIONS_DIR, previous), 'utf8') === sql) {
  console.log(`Content unchanged since ${previous}. No migration written.`)
} else {
  const file = `${migrationTimestamp(new Date())}${SUFFIX}`
  writeFileSync(join(MIGRATIONS_DIR, file), sql)
  console.log(
    `Wrote supabase/migrations/${file} (${triviaItems.length} trivia, ${wordGuessingItems.length} word, ${socialPromptItems.length} social).`,
  )
  console.log('Review it, commit it, then apply with `npx supabase db push`.')
}
