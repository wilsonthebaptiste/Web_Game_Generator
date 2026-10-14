import { useId } from 'react'
import { GAME_MODES, type GameMode } from '../../types/game'
import { MODE_INFO } from './modes'
import './game.css'

export interface ModePickerProps {
  /** The selected mode, or null when nothing is picked yet. */
  value: GameMode | null
  onChange: (mode: GameMode) => void
  disabled?: boolean
  /** Visible group label. */
  legend?: string
}

/**
 * Choose a game mode. Native radio inputs give radio-group semantics, so Tab moves into the
 * group and the arrow keys change the selection. Used by the lobby and the results view.
 */
export function ModePicker({
  value,
  onChange,
  disabled = false,
  legend = 'Game mode',
}: ModePickerProps) {
  const name = useId()

  return (
    <fieldset className="game-mode-picker" disabled={disabled}>
      <legend className="game-mode-picker__legend">{legend}</legend>
      {GAME_MODES.map((mode) => {
        const { label, description } = MODE_INFO[mode]
        const labelId = `${name}-${mode}-label`
        const descriptionId = `${name}-${mode}-description`
        return (
          <label key={mode} className="game-mode-picker__option">
            <input
              type="radio"
              name={name}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
            />
            <span className="game-mode-picker__text">
              <span id={labelId} className="game-mode-picker__label">
                {label}
              </span>
              <span id={descriptionId} className="game-mode-picker__description">
                {description}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
