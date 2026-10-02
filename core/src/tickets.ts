import { z } from 'zod'

// A simulated inbound email. A real email provider webhook maps its payload onto this shape.
export const inboundEmailSchema = z.object({
  from: z.email('Enter a valid sender email address'),
  fromName: z.string('Sender name is required').trim().min(1, 'Sender name is required').max(100),
  subject: z
    .string()
    .trim()
    .max(255, 'Subject must be at most 255 characters')
    .transform((s) => s || '(no subject)')
    .default('(no subject)'),
  body: z
    .string()
    .trim()
    .min(1, 'Email body is required')
    .max(20000, 'Email body must be at most 20000 characters'),
  messageId: z.string().trim().min(1).max(998).optional(),
  inReplyTo: z.string().trim().min(1).max(998).optional(),
})

export type InboundEmail = z.infer<typeof inboundEmailSchema>

// Columns the ticket list can be sorted by (the server sorts, the client only sends the choice).
export const ticketSortFields = [
  'id',
  'subject',
  'senderName',
  'status',
  'category',
  'assignee',
  'createdAt',
] as const

export type TicketSortField = (typeof ticketSortFields)[number]

// new: just arrived, waiting for the AI. processing: the AI is trying to resolve it. Both are hidden from
// the ticket list and are only ever set by the server, never by an agent.
export const ticketStatuses = ['new', 'processing', 'open', 'resolved', 'closed'] as const
// The statuses an agent or admin can choose, filter by or see in the list.
export const settableTicketStatuses = ['open', 'resolved', 'closed'] as const
// Statuses where the AI is still working on the ticket.
export const aiWorkingStatuses = ['new', 'processing'] as const
export const ticketCategories = ['general', 'technical', 'refund', 'other'] as const

// Who wrote a message on a ticket.
export const messageSenderTypes = ['agent', 'customer', 'ai'] as const
export type MessageSenderType = (typeof messageSenderTypes)[number]

export type TicketStatus =(typeof ticketStatuses)[number]
export type TicketCategory = (typeof ticketCategories)[number]

// Special values of the list filters: tickets with no category, tickets with no assignee, my tickets.
export const NO_CATEGORY = 'none'
export const UNASSIGNED = 'unassigned'
export const ASSIGNED_TO_ME = 'me'

// Who holds a ticket: a user id, or null to unassign.
export const assignTicketSchema = z.object({
  assigneeId: z.string('Choose an assignee or unassigned').trim().min(1).nullable(),
})

export type AssignTicketInput = z.infer<typeof assignTicketSchema>

// Status and/or category change from an agent or admin. Send only the fields that change.
export const updateTicketSchema = z
  .object({
    status: z.enum(settableTicketStatuses, 'Choose a valid status').optional(),
    category: z.enum(ticketCategories, 'Choose a valid category').optional(),
  })
  .refine((v) => v.status !== undefined || v.category !== undefined, {
    message: 'Provide a status or a category',
  })

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>

// An agent's reply to a ticket.
export const createReplySchema = z.object({
  body: z
    .string('Reply cannot be empty')
    .trim()
    .min(1, 'Reply cannot be empty')
    .max(20000, 'Reply must be at most 20000 characters'),
})

export type CreateReplyInput = z.infer<typeof createReplySchema>

// A draft reply to be rewritten by AI. Same rules as a reply.
export const polishReplySchema = createReplySchema

export type PolishReplyInput = z.infer<typeof polishReplySchema>

// The AI-polished text, put back in the reply box for the agent to review.
export const polishedReplySchema = z.object({ body: z.string() })

export type PolishedReply = z.infer<typeof polishedReplySchema>

// The AI summary of a ticket and its conversation. Generated on demand, never stored.
export const ticketSummarySchema = z.object({ summary: z.string() })

export type TicketSummary = z.infer<typeof ticketSummarySchema>
