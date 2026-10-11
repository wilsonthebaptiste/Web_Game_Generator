// Content item shapes come from the shared contract (src/types/game.ts). They hold the answer
// keys, so only src/content/ and scripts/ (content:sync) may import this folder.
import { GAME_LIMITS } from '../types/game'

export type {
  ContentItem,
  Difficulty,
  SocialContentItem,
  TriviaChoice,
  TriviaContentItem,
  WordGuessingContentItem,
} from '../types/game'

/** Length limits checked by content.test.ts. */
export const CONTENT_LIMITS = {
  promptMax: 200,
  choiceLabelMax: 60,
  answerMax: GAME_LIMITS.wordAnswerMaxLength,
  instructionsMax: 160,
} as const
