import type { Player, RevealSnapshot } from '../../types/game'

/** Highest score first. Equal scores keep join order, the same order the server uses. */
function byStanding(a: Player, b: Player): number {
  return b.score - a.score || a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)
}

export interface RankedPlayer {
  player: Player
  /** 1-based. Tied players share a rank and the next rank is skipped (1, 1, 3). */
  rank: number
  /** True when another player has the same score. */
  tied: boolean
}

/** Players in leaderboard order with their ranks. Doesn't change the array passed in. */
export function rankPlayers(players: readonly Player[]): RankedPlayer[] {
  const sorted = [...players].sort(byStanding)
  const count = new Map<number, number>()
  for (const p of sorted) count.set(p.score, (count.get(p.score) ?? 0) + 1)
  return sorted.map((player) => ({
    player,
    rank: sorted.findIndex((p) => p.score === player.score) + 1,
    tied: count.get(player.score)! > 1,
  }))
}

/**
 * Every player tied for the top score, in leaderboard order. If everyone has 0, everyone is a
 * winner. An empty list only when there are no players.
 */
export function computeWinners(players: readonly Player[]): Player[] {
  if (players.length === 0) return []
  const top = Math.max(...players.map((p) => p.score))
  return players.filter((p) => p.score === top).sort(byStanding)
}

/** Points per player id from a reveal, for `Leaderboard`'s `lastRoundPoints`. */
export function roundPoints(reveal: RevealSnapshot | null | undefined): Record<string, number> {
  return Object.fromEntries((reveal?.results ?? []).map((r) => [r.playerId, r.pointsAwarded]))
}
