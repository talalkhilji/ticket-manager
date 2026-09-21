import { useEffect, useState } from 'react'
import './App.css'

type Health = { state: 'loading' } | { state: 'ok' } | { state: 'error'; message: string }

function App() {
  const [health, setHealth] = useState<Health>({ state: 'loading' })

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        return res.json() as Promise<{ status: string }>
      })
      .then((data) =>
        setHealth(
          data.status === 'ok'
            ? { state: 'ok' }
            : { state: 'error', message: `Unexpected status: ${data.status}` },
        ),
      )
      .catch((err: Error) => setHealth({ state: 'error', message: err.message }))
  }, [])

  return (
    <main>
      <h1>Ticket Manager</h1>
      {health.state === 'loading' && <p>Checking server...</p>}
      {health.state === 'ok' && <p>Server is running and healthy.</p>}
      {health.state === 'error' && <p>Could not reach the server: {health.message}</p>}
    </main>
  )
}

export default App
