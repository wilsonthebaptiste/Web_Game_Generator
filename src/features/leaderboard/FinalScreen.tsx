import { Link } from 'react-router-dom'
import type { Player, RoomSession } from '../../types/game'
import { Leaderboard } from './Leaderboard'
import { computeWinners } from './winners'
import './leaderboard.css'

export interface FinalScreenProps {
  session: RoomSession
}

/** "Ava", "Ava and Ben", "Ava, Ben and Cleo". */
function listNames(names: string[]): string {
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`

/** Rendered by `RoomPage` when `room.status` is `finished`. */
export function FinalScreen({ session }: FinalScreenProps) {
  const winners = computeWinners(session.players)
  const name = (p: Player) => (p.id === session.me.id ? `${p.displayName} (you)` : p.displayName)
  const top = winners[0]?.score ?? 0

  return (
    <main className="app-main">
      <section className="lb-final" aria-labelledby="lb-final-heading">
        <h1 id="lb-final-heading">Game over</h1>
        {winners.length > 0 && (
          <div className="lb-final__winner">
            <p className="lb-final__headline">
              {winners.length === 1 ? `🏆 ${name(winners[0])} wins!` : '🏆 It’s a tie!'}
            </p>
            <p className="lb-final__detail">
              {winners.length === 1
                ? `With ${points(top)}.`
                : `${listNames(winners.map(name))} share the top score with ${points(top)}.`}
            </p>
          </div>
        )}
        <Leaderboard
          players={session.players}
          highlightPlayerId={session.me.id}
          heading="Final scores"
        />
        <Link to="/" className="ui-button ui-button--primary ui-button--full lb-final__new">
          Create a new room
        </Link>
      </section>
    </main>
  )
}
