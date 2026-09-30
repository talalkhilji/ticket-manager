import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '../lib/auth-client'

export function NavBar() {
  const navigate = useNavigate()
  const { data } = authClient.useSession()

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="flex items-center justify-between border-b bg-card px-6 py-4">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold">
          Ticket Manager
        </Link>
        <Link
          to="/tickets"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Tickets
        </Link>
        {data?.user?.role === 'admin' && (
          <Link
            to="/users"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Users
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        {data?.user && <span className="text-sm text-muted-foreground">{data.user.name}</span>}
        <Button type="button" variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </nav>
  )
}
