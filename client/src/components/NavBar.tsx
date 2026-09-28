import { useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client'

export function NavBar() {
  const navigate = useNavigate()
  const { data } = authClient.useSession()

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
      <span className="text-lg font-medium text-[var(--text-h)]">Ticket Manager</span>
      <div className="flex items-center gap-4">
        {data?.user && <span className="text-sm">{data.user.name}</span>}
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent-bg)]"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
