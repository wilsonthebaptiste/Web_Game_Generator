import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="app-main">
      <h1>Page not found</h1>
      <p>
        That page doesn't exist. <Link to="/">Go to the home page</Link> to create or join a room.
      </p>
    </main>
  )
}
