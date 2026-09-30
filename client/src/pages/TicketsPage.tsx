import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import {
  ASSIGNED_TO_ME,
  NO_CATEGORY,
  UNASSIGNED,
  ticketCategories,
  ticketSortFields,
  ticketStatuses,
  type TicketSortField,
} from 'core'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { NavBar } from '../components/NavBar'
import { Pagination } from '../components/Pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TicketRow = {
  id: number
  subject: string
  senderEmail: string
  senderName: string
  status: 'open' | 'resolved' | 'closed'
  category: 'general' | 'technical' | 'refund' | 'other' | null
  createdAt: string
  assignee: { id: string; name: string } | null
}

type TicketsResponse = { tickets: TicketRow[]; total: number; page: number; pageSize: number }

const PAGE_SIZES = [10, 20, 50, 100] as const
const DEFAULT_PAGE_SIZE = 10

// The server does the sorting, so the default matches the server's: newest first.
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }]

const statusVariant = {
  open: 'default',
  resolved: 'secondary',
  closed: 'outline',
} as const

// No sorted row model: with manualSorting the table only tracks the sort state, the server orders rows.
const features = tableFeatures({ rowSortingFeature })
const helper = createColumnHelper<typeof features, TicketRow>()

// Column ids double as the `sortBy` values the API accepts.
const columns = helper.columns([
  helper.accessor('id', { id: 'id' satisfies TicketSortField, header: '#' }),
  helper.accessor('subject', {
    id: 'subject' satisfies TicketSortField,
    header: 'Subject',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  helper.accessor('senderName', {
    id: 'senderName' satisfies TicketSortField,
    header: 'From',
    cell: (info) => (
      <>
        <div>{info.getValue()}</div>
        <div className="text-xs text-muted-foreground">{info.row.original.senderEmail}</div>
      </>
    ),
  }),
  helper.accessor('status', {
    id: 'status' satisfies TicketSortField,
    header: 'Status',
    cell: (info) => (
      <Badge variant={statusVariant[info.getValue()]} className="capitalize">
        {info.getValue()}
      </Badge>
    ),
  }),
  helper.accessor('category', {
    id: 'category' satisfies TicketSortField,
    header: 'Category',
    cell: (info) =>
      info.getValue() ? (
        <span className="capitalize">{info.getValue()}</span>
      ) : (
        <span className="text-muted-foreground">Uncategorised</span>
      ),
  }),
  helper.accessor((row) => row.assignee?.name ?? null, {
    id: 'assignee' satisfies TicketSortField,
    header: 'Assignee',
    cell: (info) =>
      info.getValue() ?? <span className="text-muted-foreground">Unassigned</span>,
  }),
  helper.accessor('createdAt', {
    id: 'createdAt' satisfies TicketSortField,
    header: 'Received',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
])

const ariaSort = { asc: 'ascending', desc: 'descending' } as const

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]) =>
  allowed.find((a) => a === value)

export function TicketsPage() {
  // Page, sort and filters live in the URL, so a filtered list can be bookmarked or shared.
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const pageSize =
    PAGE_SIZES.find((size) => size === Number(params.get('pageSize'))) ?? DEFAULT_PAGE_SIZE
  const sortBy = oneOf(params.get('sortBy'), ticketSortFields) ?? DEFAULT_SORTING[0].id
  const sortOrder = oneOf(params.get('sortOrder'), ['asc', 'desc'] as const) ?? 'desc'
  const status = oneOf(params.get('status'), ticketStatuses)
  const category = oneOf(params.get('category'), [...ticketCategories, NO_CATEGORY])
  const assignee = oneOf(params.get('assignee'), [ASSIGNED_TO_ME, UNASSIGNED])
  const search = params.get('search')?.trim() || undefined
  const sorting: SortingState = [{ id: sortBy, desc: sortOrder === 'desc' }]

  // Changing a filter or the sort goes back to page 1; only paging keeps the current page.
  const update = (changes: Record<string, string | undefined>, keepPage = false) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!keepPage) next.delete('page')
      return next
    })

  const [searchText, setSearchText] = useState(search ?? '')
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() !== (search ?? '')) update({ search: searchText.trim() || undefined })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  const filtered = Boolean(status || category || assignee || search)

  const { data, error, isPending } = useQuery({
    queryKey: ['tickets', page, pageSize, sortBy, sortOrder, status, category, assignee, search],
    queryFn: ({ signal }) =>
      api
        .get<TicketsResponse>('/tickets', {
          params: { page, pageSize, sortBy, sortOrder, status, category, assignee, search },
          signal,
        })
        .then((res) => res.data),
    placeholderData: (previous) => previous,
  })

  const table = useTable({
    features,
    columns,
    data: data?.tickets ?? [],
    manualSorting: true,
    enableMultiSort: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      // Toggling a column off falls back to the default order instead of an undefined one.
      const [sort] = next.length ? next : DEFAULT_SORTING
      update({ sortBy: sort.id, sortOrder: sort.desc ? 'desc' : 'asc' })
    },
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  // A URL (or a shrinking result set) can point past the last page: step back to it.
  const pastEnd = data && data.page === page && page > totalPages
  useEffect(() => {
    if (pastEnd) update({ page: String(totalPages) }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastEnd, totalPages])

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Tickets</h1>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label="Search tickets"
            placeholder="Search subject, name or email"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-64"
          />
          <select
            aria-label="Status"
            className={selectClass}
            value={status ?? ''}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {ticketStatuses.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            className={selectClass}
            value={category ?? ''}
            onChange={(e) => update({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {ticketCategories.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
            <option value={NO_CATEGORY}>Uncategorised</option>
          </select>
          <select
            aria-label="Assignee"
            className={selectClass}
            value={assignee ?? ''}
            onChange={(e) => update({ assignee: e.target.value })}
          >
            <option value="">Everyone</option>
            <option value={ASSIGNED_TO_ME}>Assigned to me</option>
            <option value={UNASSIGNED}>Unassigned</option>
          </select>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchText('')
                update({ status: undefined, category: undefined, assignee: undefined, search: undefined })
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-destructive">
            Could not load tickets: {error.message}
          </p>
        )}
        {(data || isPending) && (
          <>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const Icon =
                        sorted === 'asc'
                          ? ArrowUpIcon
                          : sorted === 'desc'
                            ? ArrowDownIcon
                            : ArrowUpDownIcon
                      return (
                        <TableHead key={header.id} aria-sort={sorted ? ariaSort[sorted] : undefined}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2.5"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            <Icon
                              aria-hidden
                              className={sorted ? undefined : 'text-muted-foreground'}
                            />
                          </Button>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody aria-busy={isPending}>
                {isPending &&
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: columns.length }, (_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {data?.tickets.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center text-muted-foreground"
                    >
                      {filtered ? 'No tickets match these filters.' : 'No tickets yet.'}
                    </TableCell>
                  </TableRow>
                )}
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={data.total}
                pageSize={data.pageSize}
                pageSizeOptions={PAGE_SIZES}
                noun={['ticket', 'tickets']}
                onPageChange={(next) => update({ page: String(next) }, true)}
                onPageSizeChange={(size) =>
                  update({ pageSize: size === DEFAULT_PAGE_SIZE ? undefined : String(size) })
                }
              />
            )}
          </>
        )}
      </main>
    </>
  )
}
