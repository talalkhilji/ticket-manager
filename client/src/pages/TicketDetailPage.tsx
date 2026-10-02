import { Link, useParams } from 'react-router'
import {
  aiWorkingStatuses,
  settableTicketStatuses,
  ticketCategories,
  type MessageSenderType,
  type TicketStatus,
  type UpdateTicketInput,
} from 'core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ArrowLeftIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { NavBar } from '../components/NavBar'
import { ReplyForm } from '../components/ReplyForm'
import { SummarizeButton } from '../components/SummarizeButton'
import { authClient } from '../lib/auth-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type TicketMessage = {
  id: number
  direction: 'inbound' | 'outbound'
  senderType: MessageSenderType
  fromEmail: string
  body: string
  createdAt: string
}

type TicketDetail = {
  id: number
  subject: string
  senderEmail: string
  senderName: string
  status: TicketStatus
  category: 'general' | 'technical' | 'refund' | 'other' | null
  createdAt: string
  assignee: { id: string; name: string } | null
  messages: TicketMessage[]
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

// The server's error text when it sent one (for example "Another agent holds this ticket").
function errorMessage(err: Error) {
  return isAxiosError<{ error?: string }>(err) ? (err.response?.data.error ?? err.message) : err.message
}

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1)

// new and processing: the AI is still trying to answer the ticket from the knowledge base.
const isAiWorking = (status: TicketStatus) => (aiWorkingStatuses as readonly string[]).includes(status)

const senderLabels: Record<MessageSenderType, string> = { agent: 'Agent', customer: 'Customer', ai: 'AI' }
const senderBadgeVariant = { agent: 'default', customer: 'outline', ai: 'secondary' } as const

// Agents and admins set open or resolved and pick the category; only admins can close, and closed is final.
function StatusAndCategoryControls({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user.role === 'admin'
  const closed = ticket.status === 'closed'
  const working = isAiWorking(ticket.status)

  const update = useMutation({
    mutationFn: (changes: UpdateTicketInput) => api.patch(`/tickets/${ticket.id}`, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket', String(ticket.id)] })
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  return (
    <>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Status</span>
        <select
          className={selectClass}
          value={ticket.status}
          // A closed ticket cannot change, nor can one the AI is working on; a non-admin cannot choose closed.
          disabled={update.isPending || closed || working}
          onChange={(e) => update.mutate({ status: e.target.value as NonNullable<UpdateTicketInput['status']> })}
        >
          {(working ? [ticket.status] : settableTicketStatuses.filter((st) => isAdmin || st !== 'closed' || closed))
            .map((st) => (
              <option key={st} value={st}>
                {capitalise(st)}
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Category</span>
        <select
          className={selectClass}
          value={ticket.category ?? ''}
          disabled={update.isPending}
          onChange={(e) =>
            update.mutate({ category: e.target.value as NonNullable<TicketDetail['category']> })
          }
        >
          {!ticket.category && (
            <option value="" disabled>
              Uncategorised
            </option>
          )}
          {ticketCategories.map((c) => (
            <option key={c} value={c}>
              {capitalise(c)}
            </option>
          ))}
        </select>
      </label>
      {update.error && (
        <span role="alert" className="text-destructive">
          {errorMessage(update.error)}
        </span>
      )}
    </>
  )
}

// Agents take an unassigned ticket or release their own; admins pick any agent. The server enforces this too.
function AssigneeControl({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const userId = session?.user.id
  const isAdmin = session?.user.role === 'admin'

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    enabled: isAdmin,
    queryFn: ({ signal }) =>
      api.get<{ agents: { id: string; name: string }[] }>('/users/agents', { signal }).then((res) => res.data.agents),
  })

  const assign = useMutation({
    mutationFn: (assigneeId: string | null) =>
      api.put(`/tickets/${ticket.id}/assignee`, { assigneeId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ticket', String(ticket.id)] })
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const heldByMe = ticket.assignee?.id === userId
  const error = assign.error ? errorMessage(assign.error) : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin ? (
        <select
          aria-label="Assignee"
          className={selectClass}
          value={ticket.assignee?.id ?? ''}
          disabled={assign.isPending}
          onChange={(e) => assign.mutate(e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {/* Keep the current holder selectable even if they are no longer an active agent. */}
          {ticket.assignee && !agents?.some((a) => a.id === ticket.assignee?.id) && (
            <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
          )}
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          <span>{ticket.assignee?.name ?? 'Unassigned'}</span>
          {!ticket.assignee && (
            <Button size="sm" disabled={assign.isPending} onClick={() => assign.mutate(userId ?? null)}>
              Assign to me
            </Button>
          )}
          {heldByMe && (
            <Button
              size="sm"
              variant="outline"
              disabled={assign.isPending}
              onClick={() => assign.mutate(null)}
            >
              Unassign
            </Button>
          )}
        </>
      )}
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

export function TicketDetailPage() {
  const { id } = useParams()
  const validId = /^\d+$/.test(id ?? '')

  const { data, error, isPending } = useQuery({
    queryKey: ['ticket', id],
    enabled: validId,
    // No retries: a missing ticket will not appear on retry, and it would delay the "not found" message.
    retry: false,
    queryFn: ({ signal }) =>
      api.get<TicketDetail>(`/tickets/${id}`, { signal }).then((res) => res.data),
  })

  const notFound = !validId || (isAxiosError(error) && error.response?.status === 404)

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl p-6">
        <Link
          to="/tickets"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Back to tickets
        </Link>

        {notFound && (
          <p role="alert" className="text-destructive">
            Ticket not found.
          </p>
        )}
        {!notFound && error && (
          <p role="alert" className="text-destructive">
            Could not load ticket: {error.message}
          </p>
        )}
        {!notFound && isPending && !error && (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {data && (
          <>
            <h1 className="mb-2 text-2xl font-semibold">{data.subject}</h1>
            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <StatusAndCategoryControls ticket={data} />
              <span>
                <span className="text-muted-foreground">From </span>
                {data.senderName} ({data.senderEmail})
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">Assignee </span>
                <AssigneeControl ticket={data} />
              </span>
              <span>
                <span className="text-muted-foreground">Received </span>
                {new Date(data.createdAt).toLocaleString()}
              </span>
            </div>

            <h2 className="mb-3 text-lg font-semibold">Messages</h2>
            <ol className="space-y-3">
              {data.messages.map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg border p-4 ${m.senderType === 'customer' ? '' : 'bg-muted'}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Badge variant={senderBadgeVariant[m.senderType]}>{senderLabels[m.senderType]}</Badge>
                      <span>
                        {m.direction === 'inbound' ? 'Received from' : 'Sent by'} {m.fromEmail}
                      </span>
                    </span>
                    <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              ))}
            </ol>

            <SummarizeButton ticketId={data.id} />

            {data.status === 'closed' ? (
              <p className="mt-6 text-sm text-muted-foreground">
                This ticket is closed and cannot be replied to.
              </p>
            ) : isAiWorking(data.status) ? (
              <p className="mt-6 text-sm text-muted-foreground">
                The AI is still working on this ticket. Replying is available once it has finished.
              </p>
            ) : (
              <ReplyForm ticketId={data.id} />
            )}
          </>
        )}
      </main>
    </>
  )
}
