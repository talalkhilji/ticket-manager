import type { InboundEmail } from 'core'
import { prisma } from '../db.js'
import { sanitizeText } from '../sanitize.js'
import { classifyTicket, isClassifyConfigured } from './classify.js'

/**
 * Sets the category of a new ticket with AI, in the background. Call it without awaiting (`void`) after
 * the response is sent. It never throws: any failure leaves the ticket uncategorised for an agent.
 * The write only happens while the category is still unset, so an agent's manual choice is never overwritten.
 */
export async function classifyTicketInBackground(ticketId: number): Promise<void> {
  if (!isClassifyConfigured()) return
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subject: true,
        category: true,
        messages: { where: { direction: 'inbound' }, orderBy: { createdAt: 'asc' }, take: 1, select: { body: true } },
      },
    })
    if (!ticket || ticket.category !== null) return
    const category = await classifyTicket({ subject: ticket.subject, body: ticket.messages[0]?.body ?? '' })
    await prisma.ticket.updateMany({ where: { id: ticketId, category: null }, data: { category } })
  } catch (err) {
    console.error(`Classify failed for ticket ${ticketId}:`, err instanceof Error ? err.message : 'unknown error')
  }
}

/**
 * Creates a ticket (status open, category general) with the email as its first inbound message.
 * A repeated `messageId` returns the existing ticket instead of creating a second one.
 */
export async function createTicketFromEmail(rawEmail: InboundEmail) {
  // HTML in the subject, sender name or body is stripped to plain text before anything is stored.
  const email = {
    ...rawEmail,
    subject: sanitizeText(rawEmail.subject) || '(no subject)',
    fromName: sanitizeText(rawEmail.fromName) || rawEmail.from,
    body: sanitizeText(rawEmail.body) || '(no content)',
  }

  if (email.messageId) {
    const existing = await prisma.message.findUnique({
      where: { messageId: email.messageId },
      include: { ticket: true },
    })
    if (existing) return { ticket: existing.ticket, created: false }
  }

  try {
    const ticket = await prisma.ticket.create({
      data: {
        subject: email.subject,
        senderEmail: email.from,
        senderName: email.fromName,
        messages: {
          create: {
            direction: 'inbound',
            senderType: 'customer',
            fromEmail: email.from,
            body: email.body,
            messageId: email.messageId,
            inReplyTo: email.inReplyTo,
          },
        },
      },
    })
    return { ticket, created: true }
  } catch (err) {
    // Two concurrent deliveries of the same email: the unique messageId rejects the second.
    if (email.messageId && (err as { code?: string }).code === 'P2002') {
      const existing = await prisma.message.findUnique({
        where: { messageId: email.messageId },
        include: { ticket: true },
      })
      if (existing) return { ticket: existing.ticket, created: false }
    }
    throw err
  }
}
