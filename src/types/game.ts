/**
 * Shared game contract. Owned by Contributor C; changes need a proposal in team chat
 * (plan.md §9 rule 1).
 *
 * DRAFT: this is the minimum the scaffold's stub services need. The full contract
 * (per-mode content, prompt and reveal snapshots, RoundResult, AppError codes) lands in
 * `feat/shared-contracts`, which A and B review.
 */

export type GameMode = 'trivia' | 'word-guessing' | 'social'

export type RoomStatus = 'lobby' | 'playing' | 'finished'
export type RoundStatus = 'answering' | 'revealed'

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

export interface Round {
  id: string
  roomId: string
  roundNumber: number
  mode: GameMode
  status: RoundStatus
  /** Public prompt only; never contains the answer. Typed per mode in feat/shared-contracts. */
  promptSnapshot: unknown
  /** Null until the round is revealed. Typed in feat/shared-contracts. */
  revealSnapshot: unknown | null
  submissionCount: number
  createdAt: string
  revealedAt: string | null
}

/** plan.md §1.5 */
export type AnswerPayload = { choiceId: string } | { text: string } | { votedPlayerId: string }

/** Returned by `get_room_snapshot(code)`. The authoritative state after joining or reconnecting. */
export interface RoomSnapshot {
  room: Room
  players: Player[]
  currentRound: Round | null
  /** The caller's player row, or null if this browser has not joined the room. */
  me: Player | null
  /** The caller's answer for the current round, if any. */
  myAnswer: AnswerPayload | null
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline'

/** The single prop every room view (lobby, game, final) receives from `useRoomSession`. */
export interface RoomSession extends RoomSnapshot {
  connection: ConnectionStatus
}

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
