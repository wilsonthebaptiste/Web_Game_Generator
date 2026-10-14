import { useId } from 'react'
import type { Player } from '../../types/game'

export interface PlayerVoteProps {
  players: readonly Player[]
  myPlayerId: string
  allowSelfVote: boolean
  value: string | null
  onChange: (playerId: string) => void
  disabled?: boolean
}

/** One radio per player you can vote for. You are left out unless the prompt allows self-votes. */
export function PlayerVote({
  players,
  myPlayerId,
  allowSelfVote,
  value,
  onChange,
  disabled = false,
}: PlayerVoteProps) {
  const name = useId()
  const candidates = allowSelfVote ? players : players.filter((p) => p.id !== myPlayerId)
  return (
    <fieldset className="game-options" disabled={disabled}>
      <legend className="visually-hidden">Vote for a player</legend>
      {candidates.map((player) => (
        <label key={player.id} className="game-option">
          <input
            type="radio"
            name={name}
            value={player.id}
            checked={value === player.id}
            onChange={() => onChange(player.id)}
          />
          <span>
            {player.displayName}
            {player.id === myPlayerId && ' (you)'}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
