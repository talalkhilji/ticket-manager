import { useEffect, useState } from 'react'
import { NavBar } from '../components/NavBar'
import { authClient } from '../lib/auth-client'

type Health = { state: 'loading' } | { state: 'ok' } | { state: 'error'; message: string }

export function HomePage() {
  const { data } = authClient.useSession()
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
    <>
      <NavBar />
      <main className="p-6">
        <h1>Welcome, {data?.user?.name}</h1>
        {health.state === 'loading' && <p>Checking server...</p>}
        {health.state === 'ok' && <p>Server is running and healthy.</p>}
        {health.state === 'error' && <p>Could not reach the server: {health.message}</p>}
      </main>
    </>
  )
}
