import { timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { inboundEmailSchema } from 'core'
import { env } from '../env.js'
import { enqueueAutoResolveTicket, enqueueClassifyTicket } from '../queue.js'
import { createTicketFromEmail } from '../services/tickets.js'

export const inboundRouter = Router()

function hasValidSecret(req: Request): boolean {
  const expected = env.INBOUND_SECRET
  const given = req.header('x-inbound-secret')
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function requireInboundSecret(req: Request, res: Response, next: NextFunction) {
  if (!hasValidSecret(req)) {
    res.status(401).json({ error: 'Invalid or missing inbound secret' })
    return
  }
  next()
}

/**
 * @openapi
 * /api/inbound/email:
 *   post:
 *     summary: Simulate an inbound support email and turn it into a ticket
 *     description: Stand-in for an email provider webhook. Requires the x-inbound-secret header.
 *     parameters:
 *       - in: header
 *         name: x-inbound-secret
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, body]
 *             properties:
 *               from: { type: string, format: email }
 *               fromName: { type: string }
 *               subject: { type: string }
 *               body: { type: string }
 *               messageId: { type: string, description: Repeated ids do not create a second ticket }
 *               inReplyTo: { type: string }
 *     responses:
 *       201:
 *         description: Ticket created
 *       200:
 *         description: Email already received (duplicate messageId), existing ticket returned
 *       400:
 *         description: Invalid body
 *       401:
 *         description: Missing or wrong secret
 */
inboundRouter.post('/email', requireInboundSecret, async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues })
    return
  }

  const { ticket, created } = await createTicketFromEmail(parsed.data)
  res.status(created ? 201 : 200).json({ ticket })
  // After the response, so the webhook never waits. Queue workers classify it and try to answer it from the
  // knowledge base; duplicates are not queued again.
  if (created) {
    void enqueueClassifyTicket(ticket.id)
    if (ticket.status === 'new') void enqueueAutoResolveTicket(ticket.id)
  }
})
