import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { ErrorMessage } from './ErrorMessage'
import { Input } from './Input'
import { LoadingState } from './LoadingState'

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button')
  })

  it('is disabled and shows loading text while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button isLoading loadingText="Creating…" onClick={onClick}>
        Create
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Creating…' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Input', () => {
  it('is labelled by its visible label', () => {
    render(<Input label="Display name" />)
    expect(screen.getByLabelText('Display name')).toBeInstanceOf(HTMLInputElement)
  })

  it('marks itself invalid and is described by the error and hint', () => {
    render(<Input label="Room code" hint="4 letters" error="That room doesn't exist." />)
    const input = screen.getByLabelText('Room code')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription("4 letters That room doesn't exist.")
  })

  it('is not marked invalid without an error', () => {
    render(<Input label="Room code" />)
    expect(screen.getByLabelText('Room code')).not.toHaveAttribute('aria-invalid')
  })
})

describe('LoadingState', () => {
  it('announces its label as a status', () => {
    render(<LoadingState label="Joining…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Joining…')
  })
})

describe('ErrorMessage', () => {
  it('shows the message as an alert', () => {
    render(<ErrorMessage message="That name is taken." />)
    expect(screen.getByRole('alert')).toHaveTextContent('That name is taken.')
  })

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = vi.fn()
    render(<ErrorMessage message="Network error." onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has no retry button without onRetry', () => {
    render(<ErrorMessage message="Room expired." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
