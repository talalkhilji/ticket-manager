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

export const ticketStatuses = ['open', 'resolved', 'closed'] as const
export const ticketCategories = ['general', 'technical', 'refund', 'other'] as const

export type TicketStatus = (typeof ticketStatuses)[number]
export type TicketCategory = (typeof ticketCategories)[number]

// Special values of the list filters: tickets with no category, tickets with no assignee, my tickets.
export const NO_CATEGORY = 'none'
export const UNASSIGNED = 'unassigned'
export const ASSIGNED_TO_ME = 'me'
