import './components.css'

export interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="ui-loading" role="status">
      <span className="ui-loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
