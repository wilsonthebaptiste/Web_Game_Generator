import { useId } from 'react'
import { WORD_GUESS_MAX_LENGTH } from './rules/validatePayload'

export interface WordGuessInputProps {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
}

/** Text field with a live character counter. The limit matches `submit_answer` (1–60). */
export function WordGuessInput({ value, onChange, disabled = false }: WordGuessInputProps) {
  const id = useId()
  const counterId = `${id}-counter`
  return (
    <div className="game-word">
      <label className="game-word__label" htmlFor={id}>
        Your guess
      </label>
      <input
        id={id}
        className="game-word__input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={WORD_GUESS_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        aria-describedby={counterId}
      />
      <span id={counterId} className="game-word__counter">
        {value.length}/{WORD_GUESS_MAX_LENGTH} characters
      </span>
    </div>
  )
}
