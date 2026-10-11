/**
 * Shared game contract. Owned by Contributor C and reviewed by A and B.
 * After Phase 1, changes need a short proposal in team chat and go through C on a
 * `chore/contract-*` branch (plan.md §9 rule 1).
 *
 * Field names here are camelCase. The database uses snake_case; services map between them.
 */

// ---------------------------------------------------------------------------
// Modes, statuses, limits
// ---------------------------------------------------------------------------

export type GameMode = 'trivia' | 'word-guessing' | 'social'

export const GAME_MODES: readonly GameMode[] = ['trivia', 'word-guessing', 'social']

export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type RoundStatus = 'answering' | 'revealed'

/** Limits enforced by both the UI and the RPCs. Change them only through a contract PR. */
export const GAME_LIMITS = {
  displayNameMinLength: 1,
  displayNameMaxLength: 20,
  wordAnswerMaxLength: 60,
  minPlayersToStart: 2,
  defaultRoundLimit: 10,
} as const

// ---------------------------------------------------------------------------
// Rooms and players
// ---------------------------------------------------------------------------

export interface Room {
  id: string
  code: string
  hostPlayerId: string
  status: RoomStatus
  selectedMode: GameMode | null
  currentRoundId: string | null
  roundLimit: number
  createdAt: string
  expiresAt: string
}

export interface Player {
  id: string
  roomId: string
  displayName: string
  score: number
  joinedAt: string
}

// ---------------------------------------------------------------------------
// Content (source of truth: src/content/*.ts, owned by B)
// Frontend code never imports these items. Only scripts/sync-content.ts reads them.
// ---------------------------------------------------------------------------

export interface TriviaChoice {
  id: string
  label: string
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface TriviaContentItem {
  id: string
  type: 'trivia'
  prompt: string
  choices: TriviaChoice[]
  correctChoiceId: string
  category?: string
  difficulty?: Difficulty
}

export interface WordGuessingContentItem {
  id: string
  type: 'word-guessing'
  /** The clue shown to players. */
  prompt: string
  targetAnswer: string
  /** Other spellings that also score, e.g. "colour" for "color". */
  acceptedAnswers?: string[]
  category?: string
}

/** MVP social content is vote-for-player only (plan.md §1.5). */
export interface SocialContentItem {
  id: string
  type: 'social'
  prompt: string
  responseType: 'vote-for-player'
  instructions?: string
  /** Self-votes are rejected unless this is true. */
  allowSelfVote?: boolean
}

export type ContentItem = TriviaContentItem | WordGuessingContentItem | SocialContentItem

// ---------------------------------------------------------------------------
// Prompt snapshots: what players see while a round is answering.
// Copied from content into `rounds.prompt_snapshot` by `start_round`.
// MUST NOT contain answers (no correctChoiceId, targetAnswer, acceptedAnswers).
// ---------------------------------------------------------------------------

export interface TriviaPromptSnapshot {
  mode: 'trivia'
  prompt: string
  choices: TriviaChoice[]
  category?: string
  difficulty?: Difficulty
}

export interface WordGuessingPromptSnapshot {
  mode: 'word-guessing'
  prompt: string
  category?: string
}

export interface SocialPromptSnapshot {
  mode: 'social'
  prompt: string
  responseType: 'vote-for-player'
  instructions?: string
  allowSelfVote: boolean
}

export type PromptSnapshot =
  TriviaPromptSnapshot | WordGuessingPromptSnapshot | SocialPromptSnapshot

// ---------------------------------------------------------------------------
// Answer payloads (plan.md §1.5). Sent to `submit_answer`, validated on the server.
// ---------------------------------------------------------------------------

export interface TriviaAnswer {
  choiceId: string
}

export interface WordGuessingAnswer {
  /** 1–60 characters after trimming. */
  text: string
}

export interface SocialAnswer {
  votedPlayerId: string
}

export interface AnswerPayloadByMode {
  trivia: TriviaAnswer
  'word-guessing': WordGuessingAnswer
  social: SocialAnswer
}

export type AnswerPayload = AnswerPayloadByMode[GameMode]

// ---------------------------------------------------------------------------
// Reveal snapshots: written once by `reveal_round` into `rounds.reveal_snapshot`.
// ---------------------------------------------------------------------------

/** One entry per player in the room at reveal time, including players who didn't answer. */
export interface RoundResult {
  playerId: string
  /** Null means "No answer". */
  answer: AnswerPayload | null
  /**
   * Points this player gained this round. For social rounds this is the number of votes the
   * player received, not anything to do with their own vote.
   */
  pointsAwarded: number
  /** Trivia and word guessing: whether the answer scored (false when there's no answer). Social: always null. */
  isCorrect: boolean | null
}

export interface TriviaRevealSnapshot {
  mode: 'trivia'
  correctChoiceId: string
  results: RoundResult[]
}

export interface WordGuessingRevealSnapshot {
  mode: 'word-guessing'
  targetAnswer: string
  acceptedAnswers: string[]
  results: RoundResult[]
}

export interface SocialRevealSnapshot {
  mode: 'social'
  results: RoundResult[]
}

export type RevealSnapshot =
  TriviaRevealSnapshot | WordGuessingRevealSnapshot | SocialRevealSnapshot

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export interface Round {
  id: string
  roomId: string
  roundNumber: number
  mode: GameMode
  status: RoundStatus
  /** `promptSnapshot.mode` always equals `mode`. */
  promptSnapshot: PromptSnapshot
  /** Null while answering; set when revealed. */
  revealSnapshot: RevealSnapshot | null
  /** How many players have submitted. Visible to everyone; the answers themselves are not. */
  submissionCount: number
  createdAt: string
  revealedAt: string | null
}

// ---------------------------------------------------------------------------
// Session: what room views receive
// ---------------------------------------------------------------------------

/** Returned by `get_room_snapshot(code)`. The authoritative state after joining or reconnecting. */
export interface RoomSnapshot {
  room: Room
  /** Sorted by `joinedAt`. */
  players: Player[]
  currentRound: Round | null
  /** The caller's player row, or null if this browser has not joined the room. */
  me: Player | null
  /** The caller's answer for the current round, if any. */
  myAnswer: AnswerPayload | null
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline'

/**
 * The single prop every room view (LobbyPage, GamePage, FinalScreen) receives from
 * `useRoomSession`. RoomPage sends non-members to `/join/:code`, so `me` is never null here.
 */
export interface RoomSession extends RoomSnapshot {
  me: Player
  /** `me.id === room.hostPlayerId` */
  isHost: boolean
  connection: ConnectionStatus
  /** Refetch the snapshot now, e.g. after the caller's own action succeeds. */
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Service inputs and outputs
// ---------------------------------------------------------------------------

export interface CreateRoomInput {
  displayName: string
}

export interface JoinRoomInput {
  roomCode: string
  displayName: string
}

/** Returned by create and join. The caller then navigates to `/room/:code`. */
export interface RoomMembership {
  room: Room
  player: Player
}

// ---------------------------------------------------------------------------
// Errors
// RPCs `raise exception '<CODE>'` with one of these codes. Services convert every failure
// with `toAppError` (src/lib/errors.ts) and throw the result.
// ---------------------------------------------------------------------------

export type AppErrorCode =
  // Input
  | 'INVALID_DISPLAY_NAME'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_MODE'
  | 'INVALID_ANSWER'
  | 'SELF_VOTE_NOT_ALLOWED'
  // Rooms and membership
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_NOT_JOINABLE'
  | 'ROOM_FINISHED'
  | 'NAME_TAKEN'
  | 'NOT_A_MEMBER'
  | 'NOT_HOST'
  // Rounds
  | 'NOT_ENOUGH_PLAYERS'
  | 'ROUND_LIMIT_REACHED'
  | 'ROUND_IN_PROGRESS'
  | 'ROUND_NOT_FOUND'
  | 'ROUND_NOT_ANSWERING'
  | 'ROUND_ALREADY_REVEALED'
  | 'NO_CONTENT_AVAILABLE'
  // Platform
  | 'NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'CODE_GENERATION_FAILED'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'CONFIG_MISSING'
  | 'UNKNOWN'

export interface AppError extends Error {
  name: 'AppError'
  code: AppErrorCode
  /** Friendly, safe to show to players. Never a raw database message. */
  message: string
}
