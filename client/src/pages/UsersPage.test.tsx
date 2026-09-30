import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { UsersPage } from './UsersPage'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
// The nav bar needs the router and the auth session; it is not what these tests cover.
vi.mock('../components/NavBar', () => ({ NavBar: () => null }))

const get = vi.mocked(api.get)

const admin = {
  id: '1',
  name: 'Alice Admin',
  email: 'alice@example.com',
  role: 'admin',
  banned: false,
  createdAt: '2026-01-15T00:00:00.000Z',
}
const agent = {
  id: '2',
  name: 'Bob Agent',
  email: 'bob@example.com',
  role: 'agent',
  banned: false,
  createdAt: '2026-02-01T00:00:00.000Z',
}
const deactivated = {
  id: '3',
  name: 'Carol Gone',
  email: 'carol@example.com',
  role: 'agent',
  banned: true,
  createdAt: '2026-03-01T00:00:00.000Z',
}

function respond(users: unknown[], total = users.length, page = 1) {
  return { data: { users, total, page, pageSize: 20 } }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  )
}

function requestedParams(callIndex = -1) {
  const [url] = get.mock.calls.at(callIndex)!
  return new URL(url, 'http://localhost').searchParams
}

describe('UsersPage', () => {
  beforeEach(() => {
    get.mockReset()
    vi.mocked(api.patch).mockReset()
    vi.mocked(api.delete).mockReset()
  })

  it('shows skeleton rows while loading', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
    const [, body] = screen.getAllByRole('rowgroup')
    expect(body).toHaveAttribute('aria-busy', 'true')
    expect(within(body).getAllByRole('row')).toHaveLength(5)
    expect(screen.queryByText(/page 1 of/i)).not.toBeInTheDocument()
  })

  it('renders each user with role and status', async () => {
    get.mockResolvedValue(respond([admin, agent, deactivated]))
    renderPage()

    const alice = (await screen.findByText('Alice Admin')).closest('tr')!
    expect(within(alice).getByText('alice@example.com')).toBeInTheDocument()
    expect(within(alice).getByText('admin')).toBeInTheDocument()
    expect(within(alice).getByText('Active')).toBeInTheDocument()

    const bob = screen.getByText('Bob Agent').closest('tr')!
    expect(within(bob).getByText('agent')).toBeInTheDocument()

    const carol = screen.getByText('Carol Gone').closest('tr')!
    expect(within(carol).getByText('Deactivated')).toBeInTheDocument()

    expect(screen.getByText('3 users · Page 1 of 1')).toBeInTheDocument()
  })

  it('requests the first page with the default page size', async () => {
    get.mockResolvedValue(respond([admin]))
    renderPage()
    await screen.findByText('Alice Admin')

    expect(requestedParams(0).get('page')).toBe('1')
    expect(requestedParams(0).get('pageSize')).toBe('20')
    expect(requestedParams(0).has('search')).toBe(false)
  })

  it('uses the singular for a single user', async () => {
    get.mockResolvedValue(respond([admin]))
    renderPage()

    expect(await screen.findByText('1 user · Page 1 of 1')).toBeInTheDocument()
  })

  it('shows an empty state when there are no users', async () => {
    get.mockResolvedValue(respond([]))
    renderPage()

    expect(await screen.findByText('No users found.')).toBeInTheDocument()
  })

  it('shows an alert when loading fails', async () => {
    get.mockRejectedValue(new Error('Request failed with status code 403'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load users: Request failed with status code 403',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('searches by name or email after the debounce and resets to page 1', async () => {
    const user = userEvent.setup()
    get.mockImplementation((url) => {
      const search = new URL(url, 'http://localhost').searchParams.get('search')
      return Promise.resolve(search ? respond([agent]) : respond([admin, agent]))
    })
    renderPage()
    await screen.findByText('Alice Admin')

    await user.type(screen.getByRole('searchbox', { name: 'Search users' }), ' bob ')

    await waitFor(() => expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument())
    expect(screen.getByText('Bob Agent')).toBeInTheDocument()
    const params = requestedParams()
    expect(params.get('search')).toBe('bob')
    expect(params.get('page')).toBe('1')
  })

  describe('create user dialog', () => {
    async function openDialog() {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([admin]))
      renderPage()
      await screen.findByText('Alice Admin')
      await user.click(screen.getByRole('button', { name: 'Create user' }))
      await screen.findByRole('dialog', { name: 'Create user' })
      return user
    }

    it('is hidden until the Create user button is clicked, then shown', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([admin]))
      renderPage()
      await screen.findByText('Alice Admin')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Create user' }))

      const dialog = await screen.findByRole('dialog', { name: 'Create user' })
      expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Email')).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Password')).toBeInTheDocument()
    })

    it('is hidden when Escape is pressed', async () => {
      const user = await openDialog()

      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('is hidden when clicking outside of it', async () => {
      const user = await openDialog()

      // The backdrop is the only thing outside the dialog that receives the click.
      await user.pointer({ keys: '[MouseLeft]', target: document.body })

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('stays open when clicking inside of it', async () => {
      const user = await openDialog()

      await user.click(screen.getByRole('heading', { name: 'Create user' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('edit user dialog', () => {
    it('shows an edit button with an accessible name on every row', async () => {
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Alice Admin')

      expect(screen.getByRole('button', { name: 'Edit Alice Admin' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit Bob Agent' })).toBeInTheDocument()
    })

    it("opens populated with the row's user, with an empty password", async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Edit Bob Agent' }))

      const dialog = await screen.findByRole('dialog', { name: 'Edit user' })
      expect(within(dialog).getByLabelText('Name')).toHaveValue('Bob Agent')
      expect(within(dialog).getByLabelText('Email')).toHaveValue('bob@example.com')
      expect(within(dialog).getByLabelText('Password')).toHaveValue('')
    })

    it('closes on Escape and shows the next row when another edit button is clicked', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Edit Bob Agent' }))
      await screen.findByRole('dialog', { name: 'Edit user' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'Edit Alice Admin' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit user' })
      expect(within(dialog).getByLabelText('Email')).toHaveValue('alice@example.com')
    })

    it('saves the change, closes the dialog and reloads the list', async () => {
      const user = userEvent.setup()
      vi.mocked(api.patch).mockResolvedValue({ data: {} })
      get.mockResolvedValue(respond([agent]))
      renderPage()
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Edit Bob Agent' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit user' })
      await user.type(within(dialog).getByLabelText('Password'), 'brandnewpass')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.patch).toHaveBeenCalledWith('/users/2', {
        name: 'Bob Agent',
        email: 'bob@example.com',
        password: 'brandnewpass',
      })
      await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
    })
  })

  describe('delete user dialog', () => {
    it('offers delete on agent rows but never on the admin row', async () => {
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Alice Admin')

      expect(screen.getByRole('button', { name: 'Delete Bob Agent' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete Alice Admin' })).not.toBeInTheDocument()
    })

    it('asks for confirmation before deleting anything', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Bob Agent')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))

      const dialog = await screen.findByRole('dialog', { name: 'Delete user' })
      expect(dialog).toHaveTextContent('Bob Agent')
      expect(dialog).toHaveTextContent('bob@example.com')
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('does not delete when cancelled, on Escape, or on an outside click', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([agent]))
      renderPage()
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))
      await user.click(await screen.findByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))
      await screen.findByRole('dialog', { name: 'Delete user' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))
      await screen.findByRole('dialog', { name: 'Delete user' })
      await user.pointer({ keys: '[MouseLeft]', target: document.body })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      expect(api.delete).not.toHaveBeenCalled()
    })

    it('deletes on confirm, closes the dialog and reloads the list', async () => {
      const user = userEvent.setup()
      vi.mocked(api.delete).mockResolvedValue({ data: undefined })
      get.mockResolvedValue(respond([admin, agent]))
      renderPage()
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete user' })
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.delete).toHaveBeenCalledWith('/users/2')
      await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
    })

    it('steps back a page when the last user on it is deleted', async () => {
      const user = userEvent.setup()
      vi.mocked(api.delete).mockResolvedValue({ data: undefined })
      let deleted = false
      get.mockImplementation((url) => {
        const page = Number(new URL(url, 'http://localhost').searchParams.get('page'))
        if (page === 1) return Promise.resolve(respond([admin], deleted ? 1 : 21, 1))
        return Promise.resolve(respond(deleted ? [] : [agent], deleted ? 1 : 21, 2))
      })
      renderPage()
      await screen.findByText('Alice Admin')
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Bob Agent')

      await user.click(screen.getByRole('button', { name: 'Delete Bob Agent' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete user' })
      deleted = true
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(await screen.findByText('1 user · Page 1 of 1')).toBeInTheDocument()
      expect(requestedParams().get('page')).toBe('1')
    })
  })

  it('pages forward and back, disabling the buttons at the ends', async () => {
    const user = userEvent.setup()
    get.mockImplementation((url) => {
      const page = Number(new URL(url, 'http://localhost').searchParams.get('page'))
      return Promise.resolve(
        respond([{ ...admin, id: `p${page}`, name: `User on page ${page}` }], 45, page),
      )
    })
    renderPage()

    expect(await screen.findByText('User on page 1')).toBeInTheDocument()
    expect(screen.getByText('45 users · Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('User on page 2')).toBeInTheDocument()
    expect(requestedParams().get('page')).toBe('2')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('User on page 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('User on page 2')).toBeInTheDocument()
  })
})
