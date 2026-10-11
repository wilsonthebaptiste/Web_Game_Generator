import { Button } from './Button'
import './components.css'

export interface ErrorMessageProps {
  title?: string
  /** A friendly message (see `src/lib/errors.ts`). Never a raw database error. */
  message: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorMessage({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorMessageProps) {
  return (
    <div className="ui-error" role="alert">
      <p className="ui-error__title">{title}</p>
      <p className="ui-error__message">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
