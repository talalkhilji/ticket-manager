import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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

function renderPage(url = '/tickets') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <TicketsPage />
      </MemoryRouter>
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
    expect(get.mock.calls[0][1]).toMatchObject({ params: { page: 1, pageSize: 10 } })
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

  describe('filtering', () => {
    const lastParams = () => paramsOf(get.mock.calls.at(-1)![1])

    it('sends no filters by default and offers every option', async () => {
      get.mockResolvedValue(respond([refund]))
      renderPage()
      await screen.findByText('Refund for my course')

      const params = paramsOf(get.mock.calls[0][1])
      expect(params.status).toBeUndefined()
      expect(params.category).toBeUndefined()
      expect(params.assignee).toBeUndefined()
      expect(params.search).toBeUndefined()
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
      expect(within(screen.getByRole('combobox', { name: 'Status' })).getAllByRole('option')).toHaveLength(4)
      expect(within(screen.getByRole('combobox', { name: 'Category' })).getAllByRole('option')).toHaveLength(6)
      expect(within(screen.getByRole('combobox', { name: 'Assignee' })).getAllByRole('option')).toHaveLength(3)
    })

    it('sends the chosen status, category and assignee to the server', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([refund]))
      renderPage()
      await screen.findByText('Refund for my course')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Resolved')
      await waitFor(() => expect(lastParams()).toMatchObject({ status: 'resolved' }))
      await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Uncategorised')
      await waitFor(() => expect(lastParams()).toMatchObject({ status: 'resolved', category: 'none' }))
      await user.selectOptions(screen.getByRole('combobox', { name: 'Assignee' }), 'Assigned to me')
      await waitFor(() =>
        expect(lastParams()).toMatchObject({ status: 'resolved', category: 'none', assignee: 'me' }),
      )
    })

    it('searches after the debounce, ignoring surrounding spaces', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([refund]))
      renderPage()
      await screen.findByText('Refund for my course')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), ' sara ')

      await waitFor(() => expect(lastParams()).toMatchObject({ search: 'sara' }))
    })

    it('starts from the filters in the URL and clears them again', async () => {
      const user = userEvent.setup()
      get.mockResolvedValue(respond([refund]))
      renderPage('/tickets?status=closed&category=refund&assignee=unassigned&search=visa&sortBy=subject&sortOrder=asc')
      await screen.findByText('Refund for my course')

      expect(get.mock.calls[0][1]).toMatchObject({
        params: {
          status: 'closed',
          category: 'refund',
          assignee: 'unassigned',
          search: 'visa',
          sortBy: 'subject',
          sortOrder: 'asc',
        },
      })
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('closed')
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('visa')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await waitFor(() => {
        const params = lastParams()
        expect(params.status).toBeUndefined()
        expect(params.search).toBeUndefined()
      })
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('')
      // Sorting is not a filter, so it stays.
      expect(lastParams()).toMatchObject({ sortBy: 'subject' })
    })

    it('ignores invalid values in the URL', async () => {
      get.mockResolvedValue(respond([refund]))
      renderPage('/tickets?status=bogus&sortBy=nope&page=-3')
      await screen.findByText('Refund for my course')

      const params = paramsOf(get.mock.calls[0][1])
      expect(params.status).toBeUndefined()
      expect(params).toMatchObject({ sortBy: 'createdAt', page: 1 })
    })

    it('goes back to page 1 when a filter changes', async () => {
      const user = userEvent.setup()
      get.mockImplementation((_url, config) => {
        const page = Number(paramsOf(config).page)
        return Promise.resolve(respond([{ ...refund, subject: `Ticket on page ${page}` }], 45, page))
      })
      renderPage('/tickets?page=3')
      await screen.findByText('Ticket on page 3')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Open')

      await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, status: 'open' }))
    })

    it('says when no ticket matches the filters', async () => {
      get.mockResolvedValue(respond([]))
      renderPage('/tickets?status=closed')

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
    })
  })

  describe('pagination', () => {
    const lastParams = () => paramsOf(get.mock.calls.at(-1)![1])
    const manyPages = (_url: string, config?: { params?: unknown }) => {
      const page = Number(paramsOf(config).page)
      return Promise.resolve(
        respond([{ ...refund, subject: `Ticket on page ${page}` }], 100, page),
      )
    }

    it('jumps to a page number and keeps the filters', async () => {
      const user = userEvent.setup()
      get.mockImplementation(manyPages)
      renderPage('/tickets?status=open')
      await screen.findByText('Ticket on page 1')

      await user.click(screen.getByRole('button', { name: 'Page 5' }))

      expect(await screen.findByText('Ticket on page 5')).toBeInTheDocument()
      expect(lastParams()).toMatchObject({ page: 5, status: 'open' })
    })

    it('changes the page size and goes back to page 1', async () => {
      const user = userEvent.setup()
      get.mockImplementation(manyPages)
      renderPage('/tickets?page=3')
      await screen.findByText('Ticket on page 3')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50')

      await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, pageSize: 50 }))
    })

    it('reads the page size from the URL and ignores unsupported sizes', async () => {
      get.mockResolvedValue(respond([refund]))
      renderPage('/tickets?pageSize=50')
      await screen.findByText('Refund for my course')
      expect(paramsOf(get.mock.calls[0][1])).toMatchObject({ pageSize: 50 })

      get.mockClear()
      renderPage('/tickets?pageSize=7')
      await waitFor(() => expect(get).toHaveBeenCalled())
      expect(paramsOf(get.mock.calls[0][1])).toMatchObject({ pageSize: 10 })
    })

    it('steps back to the last page when the URL points past the end', async () => {
      get.mockImplementation((_url, config) => {
        const page = Number(paramsOf(config).page)
        return Promise.resolve(
          page > 3
            ? respond([], 45, page)
            : respond([{ ...refund, subject: `Ticket on page ${page}` }], 45, page),
        )
      })
      renderPage('/tickets?page=9')

      expect(await screen.findByText('Ticket on page 3')).toBeInTheDocument()
      expect(lastParams()).toMatchObject({ page: 3 })
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
