import { useQuery } from '@tanstack/react-query'
import { NavBar } from '../components/NavBar'
import { authClient } from '../lib/auth-client'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

export function HomePage() {
  const { data } = authClient.useSession()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ status: string }>('/health').then((res) => res.data),
  })
  const unexpected = health.data && health.data.status !== 'ok'

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Welcome, {data?.user?.name}</h1>
        {health.isPending && <Skeleton className="h-5 w-64" />}
        {health.data && !unexpected && <p>Server is running and healthy.</p>}
        {(health.error || unexpected) && (
          <p className="text-destructive">
            Could not reach the server:{' '}
            {health.error ? health.error.message : `Unexpected status: ${health.data?.status}`}
          </p>
        )}
      </main>
    </>
  )
}
