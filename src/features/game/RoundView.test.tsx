import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { answeringSessions, AVA_ID, BEN_ID, CLEO_ID, prompts, viewAs } from '../../test/fixtures'
import { submitAnswer } from '../../services/answers'
import { GAME_MODES, type RoomSession, type SocialPromptSnapshot } from '../../types/game'
import { RoundView } from './RoundView'

vi.mock('../../services/answers', () => ({ submitAnswer: vi.fn() }))

const mockedSubmitAnswer = vi.mocked(submitAnswer)

beforeEach(() => {
  mockedSubmitAnswer.mockReset()
})

function withPrompt(base: RoomSession, prompt: SocialPromptSnapshot): RoomSession {
  return { ...base, currentRound: { ...base.currentRound!, promptSnapshot: prompt } }
}

describe('RoundView: every mode', () => {
  it.each(GAME_MODES)(
    '%s shows the round number, mode label, prompt and submitted count',
    (mode) => {
      render(<RoundView session={answeringSessions[mode].notSubmitted} />)
      expect(screen.getByText(/Round 2 of 10/)).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { level: 1, name: prompts[mode].prompt }),
      ).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('1 / 3 submitted')
      expect(screen.getByRole('status')).toHaveTextContent('Waiting for reveal')
      expect(screen.getByRole('button', { name: 'Submit answer' })).toBeInTheDocument()
    },
  )

  it.each(GAME_MODES)('%s confirms a submitted answer and offers to update it', (mode) => {
    render(<RoundView session={answeringSessions[mode].submitted} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Answer submitted ✓ (you can change it until the host reveals)',
    )
    expect(screen.getByRole('status')).toHaveTextContent('2 / 3 submitted')
    expect(screen.getByRole('button', { name: 'Update answer' })).toBeInTheDocument()
  })
})

describe('RoundView: no answer leakage before the reveal', () => {
  it.each(GAME_MODES)('%s shows no result, score or correctness', (mode) => {
    render(<RoundView session={answeringSessions[mode].submitted} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/correct answer|✓ Correct|✗ Incorrect|points|\+1/i)
  })

  it("trivia: only the viewer's own choice is selected", () => {
    render(<RoundView session={viewAs(answeringSessions.trivia.submitted, AVA_ID)} />)
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked())
  })

  it("word guessing: another player's guess never appears", () => {
    // Ben submitted "Puffin"; Ava, who hasn't answered, must not see it anywhere.
    render(<RoundView session={viewAs(answeringSessions['word-guessing'].submitted, AVA_ID)} />)
    expect(document.body.textContent).not.toMatch(/puffin|penguin/i)
    expect(screen.getByLabelText('Your guess')).toHaveValue('')
  })

  it("social: another player's vote never appears", () => {
    render(<RoundView session={viewAs(answeringSessions.social.submitted, CLEO_ID)} />)
    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked())
    expect(document.body.textContent).not.toMatch(/voted/i)
  })
})

describe('RoundView: trivia', () => {
  it('renders every choice as a radio and preselects my answer', () => {
    render(<RoundView session={answeringSessions.trivia.submitted} />)
    const group = screen.getByRole('group', { name: 'Choose an answer' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Venus' })).toBeChecked()
  })

  it('submits the chosen choice', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<RoundView session={answeringSessions.trivia.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Mars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(onSubmit).toHaveBeenCalledWith('round-trivia', { choiceId: 'b' })
  })

  it('asks for a choice before submitting', async () => {
    const onSubmit = vi.fn()
    render(<RoundView session={answeringSessions.trivia.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick one of the choices.')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('RoundView: word guessing', () => {
  it('shows a character counter and prefills my guess', () => {
    render(<RoundView session={answeringSessions['word-guessing'].submitted} />)
    const input = screen.getByLabelText('Your guess')
    expect(input).toHaveValue('Puffin')
    expect(input).toHaveAccessibleDescription('6/60 characters')
    expect(input).toHaveAttribute('maxLength', '60')
  })

  it('updates the counter as I type and submits the trimmed guess', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <RoundView session={answeringSessions['word-guessing'].notSubmitted} onSubmit={onSubmit} />,
    )
    await userEvent.type(screen.getByLabelText('Your guess'), '  Penguin ')
    expect(screen.getByText('10/60 characters')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(onSubmit).toHaveBeenCalledWith('round-word-guessing', { text: 'Penguin' })
  })

  it('rejects a blank guess', async () => {
    const onSubmit = vi.fn()
    render(
      <RoundView session={answeringSessions['word-guessing'].notSubmitted} onSubmit={onSubmit} />,
    )
    await userEvent.type(screen.getByLabelText('Your guess'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Type a guess.')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('RoundView: social', () => {
  it('lists the other players but not me when self-votes are off', () => {
    render(<RoundView session={answeringSessions.social.notSubmitted} />)
    const radios = within(screen.getByRole('group', { name: 'Vote for a player' })).getAllByRole(
      'radio',
    )
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([AVA_ID, CLEO_ID])
    expect(screen.queryByRole('radio', { name: /Ben/ })).not.toBeInTheDocument()
  })

  it('includes me when the prompt allows self-votes', () => {
    const session = withPrompt(answeringSessions.social.notSubmitted, {
      ...(prompts.social as SocialPromptSnapshot),
      allowSelfVote: true,
    })
    render(<RoundView session={session} />)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Ben (you)' })).toHaveAttribute('value', BEN_ID)
  })

  it('shows instructions when the prompt has them', () => {
    const session = withPrompt(answeringSessions.social.notSubmitted, {
      ...(prompts.social as SocialPromptSnapshot),
      instructions: 'Pick one person.',
    })
    render(<RoundView session={session} />)
    expect(screen.getByText('Pick one person.')).toBeInTheDocument()
  })

  it('submits the vote', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<RoundView session={answeringSessions.social.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Cleo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(onSubmit).toHaveBeenCalledWith('round-social', { votedPlayerId: CLEO_ID })
  })
})

describe('RoundView: submitting', () => {
  it('uses submitAnswer then refreshes the session by default', async () => {
    mockedSubmitAnswer.mockResolvedValue(undefined)
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<RoundView session={{ ...answeringSessions.trivia.notSubmitted, refresh }} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Mars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(mockedSubmitAnswer).toHaveBeenCalledWith('round-trivia', { choiceId: 'b' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the request is in flight', async () => {
    let finish!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    render(<RoundView session={answeringSessions.trivia.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Mars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))

    const busy = screen.getByRole('button', { name: 'Submitting…' })
    expect(busy).toBeDisabled()
    await userEvent.click(busy)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    finish()
    expect(await screen.findByRole('button', { name: 'Submit answer' })).toBeEnabled()
  })

  it('shows a friendly message when the submission fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'))
    render(<RoundView session={answeringSessions.trivia.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Mars' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('boom')
    expect(alert.textContent).not.toBe('')
  })
})

describe('RoundView: coverage gaps', () => {
  it('renders nothing when there is no round', () => {
    const { container } = render(
      <RoundView session={{ ...answeringSessions.trivia.notSubmitted, currentRound: null }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it.each(GAME_MODES)('%s locks the inputs while the request is in flight', async (mode) => {
    const onSubmit = vi.fn(() => new Promise<void>(() => {}))
    render(<RoundView session={answeringSessions[mode].submitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Update answer' }))
    if (mode === 'word-guessing') {
      expect(screen.getByRole('textbox')).toBeDisabled()
    } else {
      for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    }
  })

  it('caps a word guess at 60 characters and counts them', async () => {
    render(<RoundView session={answeringSessions['word-guessing'].notSubmitted} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('maxLength', '60')
    await userEvent.type(input, 'x'.repeat(70))
    expect(input).toHaveValue('x'.repeat(60))
    expect(screen.getByText('60/60 characters')).toBeInTheDocument()
  })

  it('reports an unsent change and clears it when the change is undone', async () => {
    const onDirtyChange = vi.fn()
    render(<RoundView session={answeringSessions.trivia.submitted} onDirtyChange={onDirtyChange} />)
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    await userEvent.click(screen.getByRole('radio', { name: 'Mars' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('radio', { name: 'Venus' }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('treats spaces around a saved word guess as no change', async () => {
    const onDirtyChange = vi.fn()
    render(
      <RoundView
        session={answeringSessions['word-guessing'].submitted}
        onDirtyChange={onDirtyChange}
      />,
    )
    await userEvent.type(screen.getByRole('textbox'), '  ')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps the validation message inline and sends nothing for a missing vote', async () => {
    const onSubmit = vi.fn()
    render(<RoundView session={answeringSessions.social.notSubmitted} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).not.toHaveTextContent('Your answer wasn’t sent')
  })

  it('shows other players only the count, never who submitted', () => {
    render(<RoundView session={viewAs(answeringSessions.trivia.submitted, CLEO_ID)} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 / 3 submitted')
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your answer')
    expect(screen.queryByText(/Ava|Ben/)).not.toBeInTheDocument()
  })
})
