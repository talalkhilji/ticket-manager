import { Router } from 'express'
import {
  ASSIGNED_TO_ME,
  assignTicketSchema,
  createReplySchema,
  NO_CATEGORY,
  polishReplySchema,
  UNASSIGNED,
  ticketCategories,
  ticketSortFields,
  ticketStatuses,
  updateTicketSchema,
  type TicketSortField,
} from 'core'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware/require-auth.js'
import { sanitizeText } from '../sanitize.js'
import { isPolishConfigured, polishReply } from '../services/polish.js'
import { isSummarizeConfigured, summarizeTicket } from '../services/summarize.js'

export const ticketsRouter = Router()

const ticketIdSchema = z.coerce.number().int().min(1).max(2_147_483_647)

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(ticketSortFields).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(ticketStatuses).optional(),
  category: z.enum([...ticketCategories, NO_CATEGORY]).optional(),
  assignee: z.enum([ASSIGNED_TO_ME, UNASSIGNED]).optional(),
  search: z.string().trim().max(100).optional(),
})

function orderByFor(sortBy: TicketSortField, dir: 'asc' | 'desc'): Prisma.TicketOrderByWithRelationInput {
  switch (sortBy) {
    case 'assignee':
      return { assignee: { name: dir } }
    case 'category':
      // Uncategorised tickets always sort after categorised ones.
      return { category: { sort: dir, nulls: 'last' } }
    default:
      return { [sortBy]: dir }
  }
}

/**
 * @openapi
 * /api/tickets:
 *   get:
 *     summary: List tickets, filtered and sorted on the server, newest first by default (admins and agents)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [id, subject, senderName, status, category, assignee, createdAt], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, resolved, closed] }
 *       - in: query
 *         name: category
 *         description: A category, or none for tickets without one
 *         schema: { type: string, enum: [general, technical, refund, other, none] }
 *       - in: query
 *         name: assignee
 *         description: me for the caller's tickets, unassigned for tickets nobody holds
 *         schema: { type: string, enum: [me, unassigned] }
 *       - in: query
 *         name: search
 *         description: Case-insensitive match on subject, sender name or sender email
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: A page of tickets
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Not authenticated
 */
ticketsRouter.get('/', requireAuth, async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues })
    return
  }
  const { page, pageSize, sortBy, sortOrder, status, category, assignee, search } = parsed.data

  const where: Prisma.TicketWhereInput = {
    ...(status && { status }),
    ...(category && { category: category === NO_CATEGORY ? null : category }),
    ...(assignee && {
      assigneeId: assignee === ASSIGNED_TO_ME ? (res.locals.userId as string) : null,
    }),
    ...(search && {
      OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } },
        { senderEmail: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      // Newest first by default. id breaks ties so pages stay in a stable order.
      orderBy: [orderByFor(sortBy, sortOrder), { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        subject: true,
        senderEmail: true,
        senderName: true,
        status: true,
        category: true,
        createdAt: true,
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ])

  res.json({ tickets, total, page, pageSize })
})

/**
 * @openapi
 * /api/tickets/{id}:
 *   get:
 *     summary: Get one ticket with its messages, oldest first (admins and agents)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: The ticket and its messages
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Ticket not found
 */
ticketsRouter.get('/:id', requireAuth, async (req, res) => {
  const parsed = ticketIdSchema.safeParse(req.params.id)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      subject: true,
      senderEmail: true,
      senderName: true,
      status: true,
      category: true,
      createdAt: true,
      assignee: { select: { id: true, name: true } },
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, direction: true, senderType: true, fromEmail: true, body: true, createdAt: true },
      },
    },
  })
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  res.json(ticket)
})

/**
 * @openapi
 * /api/tickets/{id}/assignee:
 *   put:
 *     summary: Assign a ticket, or unassign it with a null assigneeId
 *     description: >
 *       Agents can take an unassigned ticket for themselves and release their own, but cannot take
 *       or reassign a ticket another agent holds. Admins can assign to any active agent or unassign.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assigneeId]
 *             properties:
 *               assigneeId: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: The updated assignee
 *       400:
 *         description: Invalid id or body, or the assignee is not an active agent
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not allowed for this role, or another agent holds the ticket
 *       404:
 *         description: Ticket not found
 */
ticketsRouter.put('/:id/assignee', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }
  const body = assignTicketSchema.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', issues: body.error.issues })
    return
  }
  const { assigneeId } = body.data
  const userId = res.locals.userId as string
  const isAdmin = res.locals.role === 'admin'

  if (!isAdmin && assigneeId !== null && assigneeId !== userId) {
    res.status(403).json({ error: 'Agents can only assign a ticket to themselves' })
    return
  }
  if (isAdmin && assigneeId !== null) {
    const target = await prisma.user.findFirst({
      where: { id: assigneeId, role: 'agent', deletedAt: null, banned: { not: true } },
      select: { id: true },
    })
    if (!target) {
      res.status(400).json({ error: 'Assignee must be an active agent' })
      return
    }
  }

  // The holder check is part of the write, so two agents racing for one ticket cannot both win.
  const { count } = await prisma.ticket.updateMany({
    where: {
      id: id.data,
      ...(!isAdmin && { OR: [{ assigneeId: null }, { assigneeId: userId }] }),
    },
    data: { assigneeId },
  })
  if (count === 0) {
    const exists = await prisma.ticket.findUnique({ where: { id: id.data }, select: { id: true } })
    if (!exists) res.status(404).json({ error: 'Ticket not found' })
    else res.status(403).json({ error: 'Another agent holds this ticket' })
    return
  }

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: id.data },
    select: { id: true, assignee: { select: { id: true, name: true } } },
  })
  res.json(ticket)
})

/**
 * @openapi
 * /api/tickets/{id}:
 *   patch:
 *     summary: Change a ticket's status and/or category
 *     description: >
 *       Agents and admins can set open or resolved and pick a category. Only admins can close a ticket.
 *       A closed ticket is final: its status cannot change again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [open, resolved, closed] }
 *               category: { type: string, enum: [general, technical, refund, other] }
 *     responses:
 *       200:
 *         description: The updated status and category
 *       400:
 *         description: Invalid id or body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Only admins can close a ticket
 *       404:
 *         description: Ticket not found
 *       409:
 *         description: The ticket is closed and its status cannot change
 */
ticketsRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }
  const body = updateTicketSchema.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', issues: body.error.issues })
    return
  }
  const { status, category } = body.data

  if (status === 'closed' && res.locals.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can close a ticket' })
    return
  }

  // A status change never touches a closed ticket; the check is part of the write so it cannot race.
  const { count } = await prisma.ticket.updateMany({
    where: { id: id.data, ...(status && { status: { not: 'closed' } }) },
    data: { ...(status && { status }), ...(category && { category }) },
  })
  if (count === 0) {
    const exists = await prisma.ticket.findUnique({ where: { id: id.data }, select: { id: true } })
    if (!exists) res.status(404).json({ error: 'Ticket not found' })
    else res.status(409).json({ error: 'A closed ticket is final and its status cannot change' })
    return
  }

  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: id.data },
    select: { id: true, status: true, category: true },
  })
  res.json(ticket)
})

/**
 * @openapi
 * /api/tickets/{id}/polish:
 *   post:
 *     summary: Improve an agent's draft reply with AI (nothing is stored or sent)
 *     description: >
 *       Same access rules as replying: agents on their own or an unassigned ticket, admins on any.
 *       A closed ticket cannot be polished. Returns 503 when no OpenAI key is configured.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 20000 }
 *     responses:
 *       200:
 *         description: The polished text as `{ body }`
 *       400:
 *         description: Invalid id or body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Another agent holds the ticket
 *       404:
 *         description: Ticket not found
 *       409:
 *         description: The ticket is closed
 *       502:
 *         description: The AI call failed
 *       503:
 *         description: Polishing is not configured
 */
ticketsRouter.post('/:id/polish', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }
  const body = polishReplySchema.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', issues: body.error.issues })
    return
  }
  if (!isPolishConfigured()) {
    res.status(503).json({ error: 'AI polish is not configured' })
    return
  }
  const userId = res.locals.userId as string
  const isAdmin = res.locals.role === 'admin'

  const ticket = await prisma.ticket.findUnique({
    where: { id: id.data },
    select: {
      subject: true,
      status: true,
      assigneeId: true,
      messages: {
        where: { direction: 'inbound' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true },
      },
    },
  })
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }
  if (ticket.status === 'closed') {
    res.status(409).json({ error: 'This ticket is closed' })
    return
  }
  if (!isAdmin && ticket.assigneeId !== null && ticket.assigneeId !== userId) {
    res.status(403).json({ error: 'Another agent holds this ticket' })
    return
  }

  try {
    const polished = await polishReply({
      subject: ticket.subject,
      // Trimmed: the model only needs the gist for tone.
      customerMessage: ticket.messages[0]?.body.slice(0, 4000) ?? null,
      draft: body.data.body,
    })
    if (!polished) throw new Error('Empty model response')
    res.json({ body: polished })
  } catch (err) {
    console.error('Polish failed:', err instanceof Error ? err.message : 'unknown error')
    res.status(502).json({ error: 'Could not polish the reply' })
  }
})

/**
 * @openapi
 * /api/tickets/{id}/summarize:
 *   post:
 *     summary: Summarize a ticket and its conversation with AI (nothing is stored or sent)
 *     description: >
 *       Read-only, so any signed-in user can summarize any ticket, including closed ones.
 *       The summary is regenerated on every call. Returns 503 when no OpenAI key is configured.
 *     responses:
 *       200:
 *         description: The summary as `{ summary }`
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Ticket not found
 *       502:
 *         description: The AI call failed
 *       503:
 *         description: Summarizing is not configured
 */
ticketsRouter.post('/:id/summarize', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }
  if (!isSummarizeConfigured()) {
    res.status(503).json({ error: 'AI summaries are not configured' })
    return
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: id.data },
    select: {
      subject: true,
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { senderType: true, body: true },
      },
    },
  })
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  try {
    const summary = await summarizeTicket({ subject: ticket.subject, messages: ticket.messages })
    if (!summary) throw new Error('Empty model response')
    res.json({ summary })
  } catch (err) {
    console.error('Summarize failed:', err instanceof Error ? err.message : 'unknown error')
    res.status(502).json({ error: 'Could not summarize the ticket' })
  }
})

/**
 * @openapi
 * /api/tickets/{id}/messages:
 *   post:
 *     summary: Reply to a ticket (stored as an outbound message; email delivery is not built yet)
 *     description: >
 *       Agents can reply on their own or an unassigned ticket (an unassigned ticket is assigned to them).
 *       Admins can reply on any ticket. A closed ticket cannot be replied to.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 20000 }
 *     responses:
 *       201:
 *         description: The stored message
 *       400:
 *         description: Invalid id or body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Another agent holds the ticket
 *       404:
 *         description: Ticket not found
 *       409:
 *         description: The ticket is closed
 */
ticketsRouter.post('/:id/messages', requireAuth, async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id)
  if (!id.success) {
    res.status(400).json({ error: 'Invalid ticket id' })
    return
  }
  const body = createReplySchema.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Invalid body', issues: body.error.issues })
    return
  }
  // Strip any HTML; a reply that is only markup ends up empty and is rejected.
  const replyBody = sanitizeText(body.data.body)
  if (!replyBody) {
    res.status(400).json({ error: 'Reply cannot be empty' })
    return
  }
  const userId = res.locals.userId as string
  const isAdmin = res.locals.role === 'admin'

  const sender = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { email: true },
  })
  if (!sender) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: id.data },
      select: { status: true, assigneeId: true },
    })
    if (!ticket) return { error: 404 as const }
    if (ticket.status === 'closed') return { error: 409 as const }
    if (!isAdmin) {
      if (ticket.assigneeId !== null && ticket.assigneeId !== userId) return { error: 403 as const }
      if (ticket.assigneeId === null) {
        // The null guard is part of the write, so two agents replying at once cannot both take it.
        const { count } = await tx.ticket.updateMany({
          where: { id: id.data, assigneeId: null },
          data: { assigneeId: userId },
        })
        if (count === 0) return { error: 403 as const }
      }
    }
    const message = await tx.message.create({
      data: {
        ticketId: id.data,
        direction: 'outbound',
        senderType: 'agent',
        fromEmail: sender.email,
        body: replyBody,
      },
      select: { id: true, direction: true, senderType: true, fromEmail: true, body: true, createdAt: true },
    })
    return { message }
  })

  if (result.error) {
    const errors = {
      404: 'Ticket not found',
      409: 'A closed ticket cannot be replied to',
      403: 'Another agent holds this ticket',
    }
    res.status(result.error).json({ error: errors[result.error] })
    return
  }
  res.status(201).json(result.message)
})
