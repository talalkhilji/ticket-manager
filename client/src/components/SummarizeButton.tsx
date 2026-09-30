import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { SparklesIcon } from 'lucide-react'
import type { TicketSummary } from 'core'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

// Asks the server for a fresh AI summary of the ticket on every click. Nothing is stored.
export function SummarizeButton({ ticketId }: { ticketId: number }) {
  const summarize = useMutation({
    mutationFn: () => api.post<TicketSummary>(`/tickets/${ticketId}/summarize`).then((res) => res.data),
  })

  const error = summarize.error
    ? isAxiosError<{ error?: string }>(summarize.error) && summarize.error.response?.data?.error
      ? summarize.error.response.data.error
      : 'Could not summarize the ticket.'
    : null

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div>
        <Button type="button" variant="outline" disabled={summarize.isPending} onClick={() => summarize.mutate()}>
          <SparklesIcon aria-hidden />
          {summarize.isPending ? 'Summarizing…' : 'Summarize'}
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
      {summarize.data && (
        <section aria-labelledby="ticket-summary-heading" className="rounded-lg border bg-muted p-4">
          <h3 id="ticket-summary-heading" className="mb-2 text-sm font-semibold">
            Summary
          </h3>
          <p className="whitespace-pre-wrap text-sm">{summarize.data.summary}</p>
        </section>
      )}
    </div>
  )
}
