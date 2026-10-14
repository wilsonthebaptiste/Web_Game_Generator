import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { GameMode } from '../../types/game'
import { ModePicker } from './ModePicker'

/** Wires value/onChange like the lobby does, so keyboard moves update the selection. */
function Controlled({ initial = null }: { initial?: GameMode | null }) {
  const [mode, setMode] = useState<GameMode | null>(initial)
  return <ModePicker value={mode} onChange={setMode} />
}

describe('ModePicker', () => {
  it('renders a labelled radio group with all three modes and their descriptions', () => {
    render(<ModePicker value={null} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Game mode' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Trivia' })).toHaveAccessibleDescription(
      'Pick the right answer from four choices.',
    )
    expect(screen.getByRole('radio', { name: 'Word guessing' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Social' })).toBeInTheDocument()
    radios.forEach((radio) => expect(radio).not.toBeChecked())
  })

  it('reflects the value prop', () => {
    render(<ModePicker value="social" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Social' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Trivia' })).not.toBeChecked()
  })

  it('calls onChange with the mode when an option is clicked', async () => {
    const onChange = vi.fn()
    render(<ModePicker value="trivia" onChange={onChange} />)
    await userEvent.click(screen.getByText('Word guessing'))
    expect(onChange).toHaveBeenCalledWith('word-guessing')
  })

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Controlled initial="trivia" />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Trivia' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    const word = screen.getByRole('radio', { name: 'Word guessing' })
    expect(word).toHaveFocus()
    expect(word).toBeChecked()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Social' })).toBeChecked()

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('radio', { name: 'Word guessing' })).toBeChecked()
  })

  it('selects with Space when nothing is picked yet', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.tab()
    await user.keyboard(' ')
    expect(screen.getByRole('radio', { name: 'Trivia' })).toBeChecked()
  })

  it('does nothing when disabled', async () => {
    const onChange = vi.fn()
    render(<ModePicker value="trivia" onChange={onChange} disabled />)
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled())
    await userEvent.click(screen.getByText('Social'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses a custom legend', () => {
    render(<ModePicker value={null} onChange={() => {}} legend="Next round mode" />)
    expect(screen.getByRole('group', { name: 'Next round mode' })).toBeInTheDocument()
  })
})
