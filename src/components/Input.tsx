import { useId, type InputHTMLAttributes } from 'react'
import './components.css'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Visible label. Required so every input is labelled. */
  label: string
  hint?: string
  /** Validation message. When set, the input is marked invalid. */
  error?: string | null
  id?: string
}

export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      {hint && (
        <span id={hintId} className="ui-field__hint">
          {hint}
        </span>
      )}
      <input
        {...rest}
        id={inputId}
        className={['ui-field__input', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <span id={errorId} className="ui-field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
