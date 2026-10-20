import type { Player } from '../../types/game'
import { rankPlayers } from './winners'
import './leaderboard.css'

export interface LeaderboardProps {
  players: readonly Player[]
  /** The viewer's player id. Their row is marked "(you)" and highlighted. */
  highlightPlayerId?: string
  /** Points each player got in the last round, by player id. Adds a "This round" column. */
  lastRoundPoints?: Record<string, number>
  /** Defaults to "Leaderboard". The final screen passes "Final scores". */
  heading?: string
}

/** Players ranked by total score. Ties share a rank and are labelled in text. */
export function Leaderboard({
  players,
  highlightPlayerId,
  lastRoundPoints,
  heading = 'Leaderboard',
}: LeaderboardProps) {
  const ranked = rankPlayers(players)

  return (
    <section className="lb" aria-labelledby="lb-heading">
      <h2 id="lb-heading" className="lb__heading">
        {heading}
      </h2>
      {ranked.length === 0 ? (
        <p className="lb__empty">No players yet.</p>
      ) : (
        <table className="lb__table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Score</th>
              {lastRoundPoints && <th scope="col">This round</th>}
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ player, rank, tied }) => {
              const isMe = player.id === highlightPlayerId
              return (
                <tr key={player.id} className={isMe ? 'lb__row lb__row--me' : 'lb__row'}>
                  <td className="lb__rank">
                    {rank}
                    {tied && <span className="visually-hidden"> (tied)</span>}
                  </td>
                  <th scope="row" className="lb__name">
                    {player.displayName}
                    {isMe && ' (you)'}
                  </th>
                  <td className="lb__score">{player.score}</td>
                  {lastRoundPoints && (
                    <td className="lb__delta">+{lastRoundPoints[player.id] ?? 0}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
