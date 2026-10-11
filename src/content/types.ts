// Content item shapes (spec §6, plan.md §1.3). These hold the answer keys, so only
// src/content/ and scripts/ (content:sync) may import them.
//
// NOTE: `feat/shared-contracts` will add the canonical content item types to
// src/types/game.ts. Once it merges, these should re-export from there instead.

export interface TriviaChoice {
  id: string
  label: string
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface TriviaItem {
  id: string
  type: 'trivia'
  prompt: string
  choices: TriviaChoice[]
  correctChoiceId: string
  category?: string
  difficulty?: Difficulty
}

export interface WordGuessingItem {
  id: string
  type: 'word-guessing'
  prompt: string
  targetAnswer: string
  acceptedAnswers?: string[]
}

export interface SocialPromptItem {
  id: string
  type: 'social'
  prompt: string
  responseType: 'vote-for-player'
  instructions?: string
  allowSelfVote?: boolean
}

export type ContentItem = TriviaItem | WordGuessingItem | SocialPromptItem

/** Length limits checked by content.test.ts. */
export const CONTENT_LIMITS = {
  promptMax: 200,
  choiceLabelMax: 60,
  answerMax: 60,
  instructionsMax: 160,
} as const
