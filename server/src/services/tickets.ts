import type { InboundEmail } from 'core'
import { prisma } from '../db.js'

/**
 * Creates a ticket (status open, category general) with the email as its first inbound message.
 * A repeated `messageId` returns the existing ticket instead of creating a second one.
 */
export async function createTicketFromEmail(email: InboundEmail) {
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
