// STUB from chore/scaffold. Ownership passes to Contributor A once the scaffold merges.
import { useParams } from 'react-router-dom'

/** Rendered for `/` and `/join/:code` (code prefilled). */
export function HomePage() {
  const { code } = useParams<{ code?: string }>()

  return (
    <main className="app-main">
      <h1>Party Game Generator</h1>
      <p>Create a room or join one with a code. (Home page coming soon.)</p>
      {code && <p>Joining room {code}</p>}
    </main>
  )
}
