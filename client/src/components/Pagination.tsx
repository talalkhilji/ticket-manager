import { Button } from '@/components/ui/button'

type PaginationProps = {
  page: number
  totalPages: number
  total: number
  pageSize: number
  pageSizeOptions: readonly number[]
  /** Singular and plural of what is listed, e.g. ['ticket', 'tickets']. */
  noun: readonly [string, string]
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

// First, last, and the pages around the current one, with null marking a gap: 1 … 4 5 6 … 20
function pageWindow(page: number, totalPages: number): Array<number | null> {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1])
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: Array<number | null> = []
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions,
  noun,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="text-muted-foreground">
        <span>
          {total} {total === 1 ? noun[0] : noun[1]} · Page {page} of {totalPages}
        </span>
        {total > 0 && (
          <span className="ml-2">
            (showing {first}–{last})
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows per page
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="sm"
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      </div>
    </div>
  )
}
