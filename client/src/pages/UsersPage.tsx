import { useEffect, useState } from 'react'
import { NavBar } from '../components/NavBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type UserRow = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent' | null
  banned: boolean | null
  createdAt: string
}

type UsersResponse = { users: UserRow[]; total: number; page: number; pageSize: number }

type Result =
  | { key: string; error: string; data?: undefined }
  | { key: string; data: UsersResponse; error?: undefined }

const PAGE_SIZE = 20

export function UsersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (debouncedSearch) params.set('search', debouncedSearch)
  const query = params.toString()

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/users?${query}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        return res.json() as Promise<UsersResponse>
      })
      .then((data) => setResult({ key: query, data }))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setResult({ key: query, error: err.message })
      })
    return () => controller.abort()
  }, [query])

  // A result for an older query means the current one is still loading.
  const current = result?.key === query ? result : null
  const data = current?.data ?? null
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Users</h1>
        <Input
          type="search"
          aria-label="Search users"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 max-w-sm"
        />

        {current?.error !== undefined && (
          <p role="alert" className="text-destructive">
            Could not load users: {current.error}
          </p>
        )}
        {!current && <p className="text-muted-foreground">Loading users...</p>}

        {data && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
                {data.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role ?? 'agent'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">Deactivated</Badge>
                      ) : (
                        <span className="text-muted-foreground">Active</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {data.total} {data.total === 1 ? 'user' : 'users'} · Page {data.page} of{' '}
                {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
