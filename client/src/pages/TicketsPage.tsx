import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import type { TicketSortField } from 'core'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { NavBar } from '../components/NavBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const PAGE_SIZE = 20

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

export function TicketsPage() {
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)

  const [sort] = sorting
  const sortBy = sort?.id ?? DEFAULT_SORTING[0].id
  const sortOrder = (sort ?? DEFAULT_SORTING[0]).desc ? 'desc' : 'asc'

  const { data, error, isPending } = useQuery({
    queryKey: ['tickets', page, sortBy, sortOrder],
    queryFn: ({ signal }) =>
      api
        .get<TicketsResponse>('/tickets', {
          params: { page, pageSize: PAGE_SIZE, sortBy, sortOrder },
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
      setSorting(next.length ? next : DEFAULT_SORTING)
      setPage(1)
    },
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Tickets</h1>

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
                      No tickets yet.
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
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {data.total} {data.total === 1 ? 'ticket' : 'tickets'} · Page {data.page} of{' '}
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
            )}
          </>
        )}
      </main>
    </>
  )
}
