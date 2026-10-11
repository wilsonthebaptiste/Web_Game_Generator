/**
 * RoomSession fixtures for UI tests and for building views before the backend exists.
 * Owned by Contributor C. Ask for new fixtures rather than editing this file.
 *
 * Cast: Ava (host), Ben, Cleo in room ABCD. Scores are consistent across states:
 * - answering (round 2): Ava 1, Ben 0, Cleo 1
 * - revealed (round 2): the round's points added on top (see each reveal snapshot)
 * - finished: `finishedTie` (Ava and Ben tied on 3) and `finishedSingleWinner` (Ava on 4)
 *
 * Answering and revealed sessions are seen by Ben (a non-host). Use `viewAs` to switch viewer.
 */
import type {
  AnswerPayload,
  GameMode,
  Player,
  PromptSnapshot,
  RevealSnapshot,
  Room,
  RoomSession,
  Round,
} from '../types/game'

export const ROOM_ID = 'room-1'
export const ROOM_CODE = 'ABCD'

const T0 = '2026-01-01T12:00:00.000Z'
const T_ROUND = '2026-01-01T12:05:00.000Z'
const T_REVEAL = '2026-01-01T12:06:00.000Z'
const T_EXPIRES = '2026-01-02T00:00:00.000Z'

function player(id: string, displayName: string, score: number, minute: number): Player {
  return {
    id,
    roomId: ROOM_ID,
    displayName,
    score,
    joinedAt: `2026-01-01T12:0${minute}:00.000Z`,
  }
}

export const AVA_ID = 'player-ava'
export const BEN_ID = 'player-ben'
export const CLEO_ID = 'player-cleo'

function cast(ava: number, ben: number, cleo: number): Player[] {
  return [
    player(AVA_ID, 'Ava', ava, 0),
    player(BEN_ID, 'Ben', ben, 1),
    player(CLEO_ID, 'Cleo', cleo, 2),
  ]
}

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: ROOM_ID,
    code: ROOM_CODE,
    hostPlayerId: AVA_ID,
    status: 'lobby',
    selectedMode: null,
    currentRoundId: null,
    roundLimit: 10,
    createdAt: T0,
    expiresAt: T_EXPIRES,
    ...overrides,
  }
}

function session(
  parts: Pick<RoomSession, 'room' | 'players'> & Partial<RoomSession>,
  viewerId = BEN_ID,
): RoomSession {
  const me = parts.players.find((p) => p.id === viewerId)
  if (!me) throw new Error(`fixture viewer ${viewerId} is not in players`)
  return {
    currentRound: null,
    myAnswer: null,
    connection: 'connected',
    refresh: async () => {},
    ...parts,
    me,
    isHost: me.id === parts.room.hostPlayerId,
  }
}

/** The same session seen by another player. Clears `myAnswer`, which is per viewer. */
export function viewAs(base: RoomSession, playerId: string): RoomSession {
  return session({ ...base, myAnswer: null }, playerId)
}

// ---------------------------------------------------------------------------
// Prompts (no answers) and reveals
// ---------------------------------------------------------------------------

export const prompts: Record<GameMode, PromptSnapshot> = {
  trivia: {
    mode: 'trivia',
    prompt: 'Which planet is known as the Red Planet?',
    choices: [
      { id: 'a', label: 'Venus' },
      { id: 'b', label: 'Mars' },
      { id: 'c', label: 'Jupiter' },
      { id: 'd', label: 'Mercury' },
    ],
    category: 'Science',
    difficulty: 'easy',
  },
  'word-guessing': {
    mode: 'word-guessing',
    prompt: 'A flightless bird that lives in Antarctica',
    category: 'Animals',
  },
  social: {
    mode: 'social',
    prompt: 'Who is most likely to forget their own birthday?',
    responseType: 'vote-for-player',
    allowSelfVote: false,
  },
}

/** Ben's answer in each answering/revealed fixture. */
export const benAnswers: Record<GameMode, AnswerPayload> = {
  trivia: { choiceId: 'a' },
  'word-guessing': { text: 'Puffin' },
  social: { votedPlayerId: AVA_ID },
}

export const reveals: Record<GameMode, RevealSnapshot> = {
  // Ava correct (+1), Ben wrong, Cleo no answer.
  trivia: {
    mode: 'trivia',
    correctChoiceId: 'b',
    results: [
      { playerId: AVA_ID, answer: { choiceId: 'b' }, pointsAwarded: 1, isCorrect: true },
      { playerId: BEN_ID, answer: benAnswers.trivia, pointsAwarded: 0, isCorrect: false },
      { playerId: CLEO_ID, answer: null, pointsAwarded: 0, isCorrect: false },
    ],
  },
  // Ava's " penguin " matches after trim + lowercase (+1), Ben wrong, Cleo no answer.
  'word-guessing': {
    mode: 'word-guessing',
    targetAnswer: 'Penguin',
    acceptedAnswers: ['penguins'],
    results: [
      { playerId: AVA_ID, answer: { text: ' penguin ' }, pointsAwarded: 1, isCorrect: true },
      { playerId: BEN_ID, answer: benAnswers['word-guessing'], pointsAwarded: 0, isCorrect: false },
      { playerId: CLEO_ID, answer: null, pointsAwarded: 0, isCorrect: false },
    ],
  },
  // Ava and Cleo vote Ben (+2 to Ben), Ben votes Ava (+1 to Ava).
  social: {
    mode: 'social',
    results: [
      { playerId: AVA_ID, answer: { votedPlayerId: BEN_ID }, pointsAwarded: 1, isCorrect: null },
      { playerId: BEN_ID, answer: benAnswers.social, pointsAwarded: 2, isCorrect: null },
      { playerId: CLEO_ID, answer: { votedPlayerId: BEN_ID }, pointsAwarded: 0, isCorrect: null },
    ],
  },
}

function round(mode: GameMode, overrides: Partial<Round> = {}): Round {
  return {
    id: `round-${mode}`,
    roomId: ROOM_ID,
    roundNumber: 2,
    mode,
    status: 'answering',
    promptSnapshot: prompts[mode],
    revealSnapshot: null,
    submissionCount: 1,
    createdAt: T_ROUND,
    revealedAt: null,
    ...overrides,
  }
}

function playingRoom(mode: GameMode): Room {
  return room({ status: 'playing', selectedMode: mode, currentRoundId: `round-${mode}` })
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export const lobbyHost: RoomSession = session({ room: room(), players: cast(0, 0, 0) }, AVA_ID)
export const lobbyGuest: RoomSession = session({ room: room(), players: cast(0, 0, 0) }, BEN_ID)
/** Only the host has joined, so Start is disabled. */
export const lobbyHostAlone: RoomSession = session(
  { room: room(), players: cast(0, 0, 0).slice(0, 1) },
  AVA_ID,
)

// ---------------------------------------------------------------------------
// Answering: Ben's view, with and without his answer submitted
// ---------------------------------------------------------------------------

function answering(mode: GameMode, submitted: boolean): RoomSession {
  return session({
    room: playingRoom(mode),
    players: cast(1, 0, 1),
    currentRound: round(mode, { submissionCount: submitted ? 2 : 1 }),
    myAnswer: submitted ? benAnswers[mode] : null,
  })
}

export const answeringSessions: Record<
  GameMode,
  { submitted: RoomSession; notSubmitted: RoomSession }
> = {
  trivia: { submitted: answering('trivia', true), notSubmitted: answering('trivia', false) },
  'word-guessing': {
    submitted: answering('word-guessing', true),
    notSubmitted: answering('word-guessing', false),
  },
  social: { submitted: answering('social', true), notSubmitted: answering('social', false) },
}

// ---------------------------------------------------------------------------
// Revealed: Ben's view, scores include this round
// ---------------------------------------------------------------------------

function revealed(mode: GameMode, scores: [number, number, number]): RoomSession {
  return session({
    room: playingRoom(mode),
    players: cast(...scores),
    currentRound: round(mode, {
      status: 'revealed',
      revealSnapshot: reveals[mode],
      submissionCount: reveals[mode].results.filter((r) => r.answer !== null).length,
      revealedAt: T_REVEAL,
    }),
    myAnswer: benAnswers[mode],
  })
}

export const revealedSessions: Record<GameMode, RoomSession> = {
  trivia: revealed('trivia', [2, 0, 1]),
  'word-guessing': revealed('word-guessing', [2, 0, 1]),
  social: revealed('social', [2, 2, 1]),
}

// ---------------------------------------------------------------------------
// Finished
// ---------------------------------------------------------------------------

function finished(scores: [number, number, number]): RoomSession {
  return session({
    room: room({ status: 'finished', selectedMode: 'social', currentRoundId: 'round-social' }),
    players: cast(...scores),
    currentRound: round('social', {
      roundNumber: 5,
      status: 'revealed',
      revealSnapshot: reveals.social,
      revealedAt: T_REVEAL,
    }),
  })
}

export const finishedTie: RoomSession = finished([3, 3, 1])
export const finishedSingleWinner: RoomSession = finished([4, 2, 1])
