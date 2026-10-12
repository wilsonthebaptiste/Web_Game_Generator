import { socialPromptItems } from '../src/content/socialPrompts'
import { triviaItems } from '../src/content/trivia'
import { wordGuessingItems } from '../src/content/wordGuessing'
import type { ContentItem } from '../src/types/game'
import { buildContentSyncSql, migrationTimestamp, splitContentItem } from './contentSync'

const allItems: ContentItem[] = [...triviaItems, ...wordGuessingItems, ...socialPromptItems]
const ANSWER_FIELDS = ['correctChoiceId', 'targetAnswer', 'acceptedAnswers']

describe('splitContentItem', () => {
  it.each(allItems.map((item) => [item.id, item] as const))(
    '%s: public payload has no answers and matches its mode',
    (_id, item) => {
      const row = splitContentItem(item)
      const json = JSON.stringify(row.publicPayload)
      for (const field of ANSWER_FIELDS) expect(json).not.toContain(field)
      expect(row.publicPayload.mode).toBe(item.type)
      expect(row.mode).toBe(item.type)
    },
  )

  it('puts the trivia answer only in the answer key', () => {
    const row = splitContentItem(triviaItems[0])
    expect(row.answerKey).toEqual({ correctChoiceId: triviaItems[0].correctChoiceId })
    expect(row.publicPayload).toMatchObject({ choices: triviaItems[0].choices })
  })

  it('always lists accepted answers for word guessing', () => {
    const row = splitContentItem({
      id: 'wrd-x',
      type: 'word-guessing',
      prompt: 'Clue',
      targetAnswer: 'answer',
    })
    expect(row.answerKey).toEqual({ targetAnswer: 'answer', acceptedAnswers: [] })
  })

  it('defaults allowSelfVote to false for social prompts', () => {
    const row = splitContentItem({
      id: 'soc-x',
      type: 'social',
      prompt: 'Who?',
      responseType: 'vote-for-player',
    })
    expect(row.publicPayload).toEqual({
      mode: 'social',
      prompt: 'Who?',
      responseType: 'vote-for-player',
      allowSelfVote: false,
    })
    expect(row.answerKey).toEqual({})
  })
})

describe('buildContentSyncSql', () => {
  it('upserts every item and deactivates removed ones', () => {
    const sql = buildContentSyncSql(allItems)
    for (const item of allItems) expect(sql).toContain(`'${item.id}'`)
    expect(sql).toContain('on conflict (id) do update set')
    expect(sql).toContain('set active = false')
  })

  it('is deterministic regardless of input order', () => {
    expect(buildContentSyncSql([...allItems].reverse())).toBe(buildContentSyncSql(allItems))
  })

  it('escapes single quotes so prompts like "Who\'s" stay valid SQL', () => {
    const sql = buildContentSyncSql([
      { id: 'soc-q', type: 'social', prompt: "Who's next?", responseType: 'vote-for-player' },
    ])
    expect(sql).toContain("Who''s next?")
  })

  it('rejects duplicate ids', () => {
    expect(() => buildContentSyncSql([triviaItems[0], triviaItems[0]])).toThrow(/Duplicate/)
  })
})

describe('migrationTimestamp', () => {
  it('uses the Supabase CLI format in UTC', () => {
    expect(migrationTimestamp(new Date('2026-10-13T04:05:06.789Z'))).toBe('20261013040506')
  })
})
