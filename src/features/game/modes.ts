import type { GameMode } from '../../types/game'

/** Display names and one-line descriptions for each mode. Safe for the UI: no content or answers. */
export const MODE_INFO: Record<GameMode, { label: string; description: string }> = {
  trivia: {
    label: 'Trivia',
    description: 'Pick the right answer from four choices.',
  },
  'word-guessing': {
    label: 'Word guessing',
    description: 'Read the clue and type the word.',
  },
  social: {
    label: 'Social',
    description: 'Vote for the player who best fits the prompt.',
  },
}
