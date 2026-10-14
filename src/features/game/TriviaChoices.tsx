import { useId } from 'react'
import type { TriviaChoice } from '../../types/game'

export interface TriviaChoicesProps {
  choices: readonly TriviaChoice[]
  value: string | null
  onChange: (choiceId: string) => void
  disabled?: boolean
}

/** One radio per choice. Arrow keys move between choices. */
export function TriviaChoices({ choices, value, onChange, disabled = false }: TriviaChoicesProps) {
  const name = useId()
  return (
    <fieldset className="game-options" disabled={disabled}>
      <legend className="visually-hidden">Choose an answer</legend>
      {choices.map((choice) => (
        <label key={choice.id} className="game-option">
          <input
            type="radio"
            name={name}
            value={choice.id}
            checked={value === choice.id}
            onChange={() => onChange(choice.id)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
