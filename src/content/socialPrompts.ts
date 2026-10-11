// Social prompt bank. IDs are stable: never reuse or renumber one. Add new items at the end.
// Keep prompts playful (spec §6): no private information, protected traits, bullying, or
// dangerous acts. All MVP prompts are vote-for-player (plan.md §1.5).
import type { SocialContentItem } from './types'

const VOTE = 'Vote for one other player.'

export const socialPromptItems: SocialContentItem[] = [
  {
    id: 'soc-001',
    type: 'social',
    prompt: 'Who is most likely to win a dance-off?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-002',
    type: 'social',
    prompt: 'Who would survive the longest on a deserted island?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-003',
    type: 'social',
    prompt: 'Who is most likely to become a famous chef?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-004',
    type: 'social',
    prompt: 'Who would make the best game-show host?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-005',
    type: 'social',
    prompt: 'Who is most likely to adopt ten pets?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-006',
    type: 'social',
    prompt: 'Who would be the first to volunteer for a trip to Mars?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-007',
    type: 'social',
    prompt: 'Who tells the best stories?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-008',
    type: 'social',
    prompt: 'Who is most likely to win a karaoke contest?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-009',
    type: 'social',
    prompt: 'Who would be the best teammate in a scavenger hunt?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-010',
    type: 'social',
    prompt: 'Who is most likely to write a best-selling novel?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-011',
    type: 'social',
    prompt: 'Who would build the most impressive sandcastle?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-012',
    type: 'social',
    prompt: 'Who is most likely to invent a new board game?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-013',
    type: 'social',
    prompt: 'Who would be the best at planning a surprise party?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-014',
    type: 'social',
    prompt: 'Who is most likely to star in a movie?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-015',
    type: 'social',
    prompt: 'Who would win a staring contest?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-016',
    type: 'social',
    prompt: 'Who has the best laugh in this room?',
    responseType: 'vote-for-player',
    instructions: 'Vote for anyone, including yourself.',
    allowSelfVote: true,
  },
  {
    id: 'soc-017',
    type: 'social',
    prompt: 'Who would be the best tour guide in your hometown?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
  {
    id: 'soc-018',
    type: 'social',
    prompt: 'Who is most likely to finish a puzzle first?',
    responseType: 'vote-for-player',
    instructions: VOTE,
  },
]
