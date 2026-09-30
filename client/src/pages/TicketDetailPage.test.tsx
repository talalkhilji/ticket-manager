import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { TicketDetailPage } from './TicketDetailPage'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
const session = vi.hoisted(() => ({ user: { id: 'me', role: 'agent' } }))
vi.mock('../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: session }) },
}))
vi.mock('../components/NavBar', () => ({ NavBar: () => null }))

const get = vi.mocked(api.get)
const put = vi.mocked(api.put)
const patch = vi.mocked(api.patch)
const post = vi.mocked(api.post)

const ticket = {
  id: 7,
  subject: 'Refund for my course',
  senderEmail: 'sara@example.com',
  senderName: 'Sara Student',
  status: 'open',
  category: null,
  createdAt: '2026-09-30T05:17:06.939Z',
  assignee: null,
  messages: [
    {
      id: 1,
      direction: 'inbound',
      senderType: 'customer',
      fromEmail: 'sara@example.com',
      body: 'Please refund me.',
      createdAt: '2026-09-30T05:17:06.939Z',
    },
  ],
}

function renderPage(url = '/tickets/7') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TicketDetailPage', () => {
  beforeEach(() => {
    get.mockReset()
    put.mockReset()
    patch.mockReset()
    post.mockReset()
    session.user = { id: 'me', role: 'agent' }
  })

  it('shows the ticket and its messages', async () => {
    get.mockResolvedValue({ data: ticket })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Refund for my course' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/tickets/7', expect.anything())
    expect(screen.getByText('Sara Student (sara@example.com)')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Uncategorised')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Open')
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Please refund me.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to tickets/i })).toHaveAttribute('href', '/tickets')
  })

  it('shows a loading state', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('says so when the ticket does not exist', async () => {
    get.mockRejectedValue(Object.assign(new Error('nope'), { isAxiosError: true, response: { status: 404 } }))
    renderPage('/tickets/999')

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found.')
  })

  it('does not call the API for a non-numeric id', () => {
    renderPage('/tickets/abc')

    expect(screen.getByRole('alert')).toHaveTextContent('Ticket not found.')
    expect(get).not.toHaveBeenCalled()
  })

  it('shows an error when loading fails', async () => {
    get.mockRejectedValue(new Error('Network Error'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load ticket: Network Error')
  })

  describe('replying', () => {
    it('sends a reply, clears the box and reloads the thread', async () => {
      get.mockResolvedValue({ data: ticket })
      post.mockResolvedValue({ data: {} })
      renderPage()

      const box = await screen.findByLabelText('Reply')
      await userEvent.type(box, '  We are looking into it.  ')
      await userEvent.click(screen.getByRole('button', { name: 'Send reply' }))

      await waitFor(() => expect(post).toHaveBeenCalledWith('/tickets/7/messages', { body: 'We are looking into it.' }))
      await waitFor(() => expect(box).toHaveValue(''))
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    })

    it('does not send an empty reply', async () => {
      get.mockResolvedValue({ data: ticket })
      renderPage()

      await screen.findByLabelText('Reply')
      await userEvent.click(screen.getByRole('button', { name: 'Send reply' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Reply cannot be empty')
      expect(post).not.toHaveBeenCalled()
    })

    it('shows the server error and keeps the text', async () => {
      get.mockResolvedValue({ data: ticket })
      post.mockRejectedValue(
        Object.assign(new Error('x'), {
          isAxiosError: true,
          response: { status: 403, data: { error: 'Another agent holds this ticket' } },
        }),
      )
      renderPage()

      const box = await screen.findByLabelText('Reply')
      await userEvent.type(box, 'Hello')
      await userEvent.click(screen.getByRole('button', { name: 'Send reply' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Another agent holds this ticket')
      expect(box).toHaveValue('Hello')
    })

    it('disables Polish while the reply box is empty', async () => {
      get.mockResolvedValue({ data: ticket })
      renderPage()

      const polish = await screen.findByRole('button', { name: 'Polish' })
      expect(polish).toBeDisabled()
      await userEvent.type(screen.getByLabelText('Reply'), 'hi')
      expect(polish).toBeEnabled()
    })

    it('polishes the draft into the reply box without sending it', async () => {
      get.mockResolvedValue({ data: ticket })
      post.mockResolvedValue({ data: { body: 'Thank you for reaching out. We are looking into it.' } })
      renderPage()

      const box = await screen.findByLabelText('Reply')
      await userEvent.type(box, 'looking into it')
      await userEvent.click(screen.getByRole('button', { name: 'Polish' }))

      await waitFor(() => expect(box).toHaveValue('Thank you for reaching out. We are looking into it.'))
      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith('/tickets/7/polish', { body: 'looking into it' })
    })

    it('shows the polish error and keeps the draft', async () => {
      get.mockResolvedValue({ data: ticket })
      post.mockRejectedValue(
        Object.assign(new Error('x'), {
          isAxiosError: true,
          response: { status: 502, data: { error: 'Could not polish the reply' } },
        }),
      )
      renderPage()

      const box = await screen.findByLabelText('Reply')
      await userEvent.type(box, 'Hello')
      await userEvent.click(screen.getByRole('button', { name: 'Polish' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not polish the reply')
      expect(box).toHaveValue('Hello')
    })

    it('shows outbound replies in the thread', async () => {
      get.mockResolvedValue({
        data: {
          ...ticket,
          messages: [
            ...ticket.messages,
            { id: 2, direction: 'outbound', senderType: 'agent', fromEmail: 'agent@example.com', body: 'On it.', createdAt: '2026-09-30T06:00:00.000Z' },
          ],
        },
      })
      renderPage()

      expect(await screen.findByText('On it.')).toBeInTheDocument()
      expect(screen.getByText('Sent by agent@example.com')).toBeInTheDocument()
      // One badge per message: the customer's first message and the agent's reply.
      expect(screen.getByText('Customer')).toBeInTheDocument()
      expect(screen.getByText('Agent')).toBeInTheDocument()
    })

    it('offers no reply form on a closed ticket', async () => {
      get.mockResolvedValue({ data: { ...ticket, status: 'closed' } })
      renderPage()

      expect(await screen.findByText(/closed and cannot be replied to/i)).toBeInTheDocument()
      expect(screen.queryByLabelText('Reply')).not.toBeInTheDocument()
    })
  })

  describe('assignment', () => {
    it('lets an agent take an unassigned ticket', async () => {
      get.mockResolvedValue({ data: ticket })
      put.mockResolvedValue({ data: {} })
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Assign to me' }))

      expect(put).toHaveBeenCalledWith('/tickets/7/assignee', { assigneeId: 'me' })
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    })

    it('lets an agent release their own ticket', async () => {
      get.mockResolvedValue({ data: { ...ticket, assignee: { id: 'me', name: 'Me Agent' } } })
      put.mockResolvedValue({ data: {} })
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Unassign' }))

      expect(put).toHaveBeenCalledWith('/tickets/7/assignee', { assigneeId: null })
    })

    it("offers no buttons on another agent's ticket", async () => {
      get.mockResolvedValue({ data: { ...ticket, assignee: { id: 'other', name: 'Bob Agent' } } })
      renderPage()

      expect(await screen.findByText('Bob Agent')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument()
    })

    it('shows the server error when assigning fails', async () => {
      get.mockResolvedValue({ data: ticket })
      put.mockRejectedValue(
        Object.assign(new Error('x'), {
          isAxiosError: true,
          response: { status: 403, data: { error: 'Another agent holds this ticket' } },
        }),
      )
      renderPage()

      await userEvent.click(await screen.findByRole('button', { name: 'Assign to me' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Another agent holds this ticket')
    })

    it('lets an admin pick any agent', async () => {
      session.user = { id: 'admin', role: 'admin' }
      get.mockImplementation((url) =>
        Promise.resolve({
          data: url === '/users/agents' ? { agents: [{ id: 'a1', name: 'Ann Agent' }] } : ticket,
        }),
      )
      put.mockResolvedValue({ data: {} })
      renderPage()

      const select = await screen.findByRole('combobox', { name: 'Assignee' })
      await screen.findByRole('option', { name: 'Ann Agent' })
      await userEvent.selectOptions(select, 'Ann Agent')

      expect(put).toHaveBeenCalledWith('/tickets/7/assignee', { assigneeId: 'a1' })
    })
  })

  describe('status and category', () => {
    it('lets an agent resolve a ticket', async () => {
      get.mockResolvedValue({ data: ticket })
      patch.mockResolvedValue({ data: {} })
      renderPage()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Status' }), 'Resolved')

      expect(patch).toHaveBeenCalledWith('/tickets/7', { status: 'resolved' })
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    })

    it('does not offer Closed to an agent', async () => {
      get.mockResolvedValue({ data: ticket })
      renderPage()

      await screen.findByRole('combobox', { name: 'Status' })
      expect(screen.queryByRole('option', { name: 'Closed' })).not.toBeInTheDocument()
    })

    it('lets an admin close a ticket', async () => {
      session.user = { id: 'admin', role: 'admin' }
      get.mockImplementation((url) =>
        Promise.resolve({ data: url === '/users/agents' ? { agents: [] } : ticket }),
      )
      patch.mockResolvedValue({ data: {} })
      renderPage()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Status' }), 'Closed')

      expect(patch).toHaveBeenCalledWith('/tickets/7', { status: 'closed' })
    })

    it('locks the status of a closed ticket', async () => {
      get.mockResolvedValue({ data: { ...ticket, status: 'closed' } })
      renderPage()

      expect(await screen.findByRole('combobox', { name: 'Status' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'Category' })).toBeEnabled()
    })

    it('lets an agent set the category', async () => {
      get.mockResolvedValue({ data: ticket })
      patch.mockResolvedValue({ data: {} })
      renderPage()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Category' }), 'Refund')

      expect(patch).toHaveBeenCalledWith('/tickets/7', { category: 'refund' })
    })

    it('shows the server error when the update fails', async () => {
      get.mockResolvedValue({ data: ticket })
      patch.mockRejectedValue(
        Object.assign(new Error('x'), {
          isAxiosError: true,
          response: { status: 409, data: { error: 'A closed ticket is final and its status cannot change' } },
        }),
      )
      renderPage()

      await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Status' }), 'Resolved')

      expect(await screen.findByRole('alert')).toHaveTextContent('A closed ticket is final')
    })
  })
})
