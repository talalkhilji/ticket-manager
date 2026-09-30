import { Router } from 'express'
import {
  ASSIGNED_TO_ME,
  NO_CATEGORY,
  UNASSIGNED,
  ticketCategories,
  ticketSortFields,
  ticketStatuses,
  type TicketSortField,
} from 'core'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware/require-auth.js'

export const ticketsRouter = Router()

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
