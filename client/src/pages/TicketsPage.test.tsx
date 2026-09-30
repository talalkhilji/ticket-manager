import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { TicketsPage } from './TicketsPage'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
// The nav bar needs the router and the auth session; it is not what these tests cover.
vi.mock('../components/NavBar', () => ({ NavBar: () => null }))

const get = vi.mocked(api.get)

const refund = {
  id: 2,
  subject: 'Refund for my course',
  senderEmail: 'sara@example.com',
  senderName: 'Sara Student',
  status: 'open',
  category: null,
  createdAt: '2026-09-30T05:17:06.939Z',
  assignee: null,
}
const technical = {
  id: 1,
  subject: 'Cannot log in',
  senderEmail: 'omar@example.com',
  senderName: 'Omar Learner',
  status: 'resolved',
  category: 'technical',
  createdAt: '2026-09-29T10:00:00.000Z',
  assignee: { id: 'u1', name: 'Bob Agent' },
}

function paramsOf(config: { params?: unknown } | undefined) {
  return (config?.params ?? {}) as Record<string, unknown>
}

function respond(tickets: unknown[], total = tickets.length, page = 1) {
  return { data: { tickets, total, page, pageSize: 20 } }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TicketsPage />
    </QueryClientProvider>,
  )
}

describe('TicketsPage', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('shows skeleton rows while loading', () => {
    get.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    const [, body] = screen.getAllByRole('rowgroup')
    expect(body).toHaveAttribute('aria-busy', 'true')
    expect(within(body).getAllByRole('row')).toHaveLength(5)
  })

  it('renders tickets in the order the server returns them (newest first)', async () => {
    get.mockResolvedValue(respond([refund, technical]))
    renderPage()

    await screen.findByText('Refund for my course')
    const [, ...rows] = screen.getAllByRole('row')
    expect(rows[0]).toHaveTextContent('Refund for my course')
    expect(rows[1]).toHaveTextContent('Cannot log in')
  })

  it('shows sender, status, category and assignee for each ticket', async () => {
    get.mockResolvedValue(respond([refund, technical]))
    renderPage()

    const first = (await screen.findByText('Refund for my course')).closest('tr')!
    expect(within(first).getByText('Sara Student')).toBeInTheDocument()
    expect(within(first).getByText('sara@example.com')).toBeInTheDocument()
    expect(within(first).getByText('open')).toBeInTheDocument()
    expect(within(first).getByText('Uncategorised')).toBeInTheDocument()
    expect(within(first).getByText('Unassigned')).toBeInTheDocument()

    const second = screen.getByText('Cannot log in').closest('tr')!
    expect(within(second).getByText('resolved')).toBeInTheDocument()
    expect(within(second).getByText('technical')).toBeInTheDocument()
    expect(within(second).getByText('Bob Agent')).toBeInTheDocument()
  })

  it('requests the first page with the default page size', async () => {
    get.mockResolvedValue(respond([refund]))
    renderPage()
    await screen.findByText('Refund for my course')

    expect(get.mock.calls[0][0]).toBe('/tickets')
    expect(get.mock.calls[0][1]).toMatchObject({ params: { page: 1, pageSize: 20 } })
    expect(screen.getByText('1 ticket · Page 1 of 1')).toBeInTheDocument()
  })

  describe('sorting', () => {
    const lastParams = () => get.mock.calls.at(-1)![1]!.params as Record<string, unknown>

    it('asks the server for newest first by default and marks the Received column', async () => {
      get.mockResolvedValue(respond([refund, technical]))
      renderPage()
      await screen.findByText('Refund for my course')

      expect(get.mock.calls[0][1]).toMatchObject({
        params: { sortBy: 'createdAt', sortOrder: 'desc' },
      })
      expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute(
        'aria-sort',
        'descending',
      )
      expect(screen.getByRole('columnheader', { name: 'Subject' })).not.toHaveAttribute('aria-sort')
    })

    it('sends the sort to the server when a header is clicked, toggling asc and desc', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([refund, technical]))
      renderPage()
      await screen.findByText('Refund for my course')

      await user.click(screen.getByRole('button', { name: 'Subject' }))
      await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'subject' }))
      expect(lastParams().sortOrder).toBe('asc')
      expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute(
        'aria-sort',
        'ascending',
      )

      await user.click(screen.getByRole('button', { name: 'Subject' }))
      await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'subject', sortOrder: 'desc' }))
    })

    it('shows rows in the order the server returns and does not re-sort them', async () => {
      const user = userEvent.setup()
      get.mockImplementation((_url, config) => {
        const sortBy = paramsOf(config).sortBy
        return Promise.resolve(
          sortBy === 'subject' ? respond([technical, refund]) : respond([refund, technical]),
        )
      })
      renderPage()
      await screen.findByText('Refund for my course')

      await user.click(screen.getByRole('button', { name: 'Subject' }))

      await waitFor(() => {
        const [, ...rows] = screen.getAllByRole('row')
        expect(rows[0]).toHaveTextContent('Cannot log in')
        expect(rows[1]).toHaveTextContent('Refund for my course')
      })
    })

    it('goes back to page 1 when the sort changes', async () => {
      const user = userEvent.setup()
      get.mockImplementation((_url, config) => {
        const page = Number(paramsOf(config).page)
        return Promise.resolve(respond([{ ...refund, subject: `Ticket on page ${page}` }], 45, page))
      })
      renderPage()
      await screen.findByText('Ticket on page 1')
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText('Ticket on page 2')

      await user.click(screen.getByRole('button', { name: 'Status' }))

      await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, sortBy: 'status' }))
    })
  })

  it('shows an empty state when there are no tickets', async () => {
    get.mockResolvedValue(respond([]))
    renderPage()

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
  })

  it('shows an alert when loading fails', async () => {
    get.mockRejectedValue(new Error('Request failed with status code 500'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load tickets: Request failed with status code 500',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('pages forward and back, disabling the buttons at the ends', async () => {
    const user = userEvent.setup()
    get.mockImplementation((_url, config) => {
      const page = Number(paramsOf(config).page)
      return Promise.resolve(
        respond([{ ...refund, id: page, subject: `Ticket on page ${page}` }], 45, page),
      )
    })
    renderPage()

    expect(await screen.findByText('Ticket on page 1')).toBeInTheDocument()
    expect(screen.getByText('45 tickets · Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Ticket on page 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Ticket on page 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Ticket on page 2')).toBeInTheDocument()
  })
})
