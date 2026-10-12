import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

describe('routes', () => {
  it('renders the home page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Party Game Generator' })).toBeInTheDocument()
  })

  it('renders the home page with the code at /join/:code', () => {
    renderAt('/join/ABCD')
    expect(screen.getByRole('heading', { name: 'Party Game Generator' })).toBeInTheDocument()
    expect(screen.getByText(/ABCD/)).toBeInTheDocument()
  })

  // Loading, views, and errors for /room/:code are covered in useRoomSession.test.tsx.
  it('renders the room page at /room/:code', () => {
    renderAt('/room/ABCDE')
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the room')
  })

  it('renders a not-found page with a link home for unknown paths', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home page/i })).toHaveAttribute('href', '/')
  })
})
