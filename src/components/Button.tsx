import type { ButtonHTMLAttributes } from 'react'
import './components.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Disables the button and shows `loadingText` while an action is in flight. */
  isLoading?: boolean
  loadingText?: string
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  isLoading = false,
  loadingText = 'Please wait…',
  fullWidth = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, fullWidth && 'ui-button--full', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? loadingText : children}
    </button>
  )
}
