import { socialPromptItems } from './socialPrompts'
import { triviaItems } from './trivia'
import { CONTENT_LIMITS, type ContentItem } from './types'
import { wordGuessingItems } from './wordGuessing'

const all: ContentItem[] = [...triviaItems, ...wordGuessingItems, ...socialPromptItems]

const isBlank = (s: string) => s.trim().length === 0

describe('content bank', () => {
  it('has unique IDs across every mode', () => {
    const ids = all.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['trivia', triviaItems, 'trv'],
    ['word-guessing', wordGuessingItems, 'wrd'],
    ['social', socialPromptItems, 'soc'],
  ] as const)(
    '%s has at least 10 items with the right type and ID prefix',
    (type, items, prefix) => {
      expect(items.length).toBeGreaterThanOrEqual(10)
      for (const item of items) {
        expect(item.type).toBe(type)
        expect(item.id).toMatch(new RegExp(`^${prefix}-\\d{3}$`))
      }
    },
  )

  it('has non-blank prompts within the length limit', () => {
    for (const item of all) {
      expect(isBlank(item.prompt), item.id).toBe(false)
      expect(item.prompt.length, item.id).toBeLessThanOrEqual(CONTENT_LIMITS.promptMax)
    }
  })

  describe('trivia', () => {
    it.each(triviaItems)(
      '$id has a valid correctChoiceId and unique, non-blank choices',
      (item) => {
        expect(item.choices.length).toBeGreaterThanOrEqual(2)
        const choiceIds = item.choices.map((c) => c.id)
        expect(new Set(choiceIds).size).toBe(choiceIds.length)
        expect(choiceIds).toContain(item.correctChoiceId)
        const labels = item.choices.map((c) => c.label.trim().toLowerCase())
        expect(new Set(labels).size).toBe(labels.length)
        for (const choice of item.choices) {
          expect(isBlank(choice.id)).toBe(false)
          expect(isBlank(choice.label)).toBe(false)
          expect(choice.label.length).toBeLessThanOrEqual(CONTENT_LIMITS.choiceLabelMax)
        }
      },
    )
  })

  describe('word guessing', () => {
    it.each(wordGuessingItems)('$id has non-blank answers within the length limit', (item) => {
      for (const answer of [item.targetAnswer, ...(item.acceptedAnswers ?? [])]) {
        expect(isBlank(answer)).toBe(false)
        expect(answer.length).toBeLessThanOrEqual(CONTENT_LIMITS.answerMax)
        // Stored answers should already be normalized so the SQL and TS comparisons agree.
        expect(answer).toBe(answer.trim().toLowerCase())
      }
    })
  })

  describe('social prompts', () => {
    it.each(socialPromptItems)('$id is a vote-for-player prompt', (item) => {
      expect(item.responseType).toBe('vote-for-player')
      if (item.instructions !== undefined) {
        expect(isBlank(item.instructions)).toBe(false)
        expect(item.instructions.length).toBeLessThanOrEqual(CONTENT_LIMITS.instructionsMax)
      }
    })
  })
})
