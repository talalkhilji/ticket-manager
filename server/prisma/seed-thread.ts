// Development data: adds 20 long replies to one ticket (110 by default) to simulate a long conversation,
// for trying the thread view and the Summarize button. The replies alternate between the customer and an
// agent, starting with whoever did not write the ticket's latest message, and each has at least 20 lines.
// Safe to re-run: it replaces the replies it added before (message ids ending in @seed-thread.example>)
// and never touches other messages. Usage: npm run seed:thread -w server [-- <ticketId>]
import { prisma } from '../src/db.js'

const ticketId = Number(process.argv[2] ?? 110)
if (!Number.isInteger(ticketId) || ticketId < 1) throw new Error('Usage: seed:thread [ticketId]')

const REPLIES = 20
const HOUR = 60 * 60 * 1000

const ticket = await prisma.ticket.findUnique({
  where: { id: ticketId },
  select: {
    senderEmail: true,
    senderName: true,
    subject: true,
    assignee: { select: { email: true, name: true } },
  },
})
if (!ticket) throw new Error(`Ticket ${ticketId} not found. Run \`npm run seed:tickets -w server\` first.`)

const removed = await prisma.message.deleteMany({
  where: { ticketId, messageId: { endsWith: '@seed-thread.example>' } },
})

const last = await prisma.message.findFirst({
  where: { ticketId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  select: { senderType: true, createdAt: true },
})

const first = ticket.senderName.split(' ')[0]
const agentName = ticket.assignee?.name.split(' ')[0] ?? 'Support'
const agentEmail = ticket.assignee?.email ?? 'support@example.com'

// Plain lines that do not promise anything (no policies, prices or refunds), so the thread is safe to summarise.
const agentSteps = [
  'I have read your message and the earlier replies on this ticket from the top.',
  'I checked the account that is linked to your email address.',
  'I looked at the most recent activity on your account.',
  'I compared what you describe with what I can see on my side.',
  'I made a note of the exact time you first noticed the problem.',
  'I asked a colleague on the team to double check my findings.',
  'I reviewed the steps you already tried and I will not ask you to repeat them.',
  'I wrote down the details so you do not have to explain them again.',
  'I tested the same steps on a fresh account to see whether it happens there too.',
  'I updated the ticket so everyone who opens it sees the full history.',
  'I checked whether other students reported something similar recently.',
  'I looked for anything unusual in the way your request was recorded.',
  'I confirmed that the details you gave match the details on file.',
  'I went through each point in your last message one by one.',
  'I prepared a short list of what happens next so nothing is left unclear.',
  'I will keep this ticket assigned to me until it is fully dealt with.',
  'I am not able to say more than I can see, and I will not guess.',
  'I will tell you straight away if I learn anything new.',
  'Please keep the same email address when you answer so that everything stays in one place.',
  'If something I wrote is unclear, tell me which part and I will explain it differently.',
]

const customerPoints = [
  'I read your last message carefully and I appreciate the detail.',
  'I tried what you suggested, step by step, and I wrote down what happened.',
  'The first thing I noticed is that nothing looked different afterwards.',
  'The second thing is that it happened at about the same time as before.',
  'I also tried again from another device to rule out my own setup.',
  'I cleared what I could on my side and started from the beginning once more.',
  'I am not very technical, so please tell me if I misunderstood any step.',
  'I checked my email, including the spam folder, and found nothing new there.',
  'I asked a friend who uses the same platform and their experience was a little different.',
  'I have a deadline coming up, which is why I am following up so closely.',
  'I do not want to make things harder, I just want to understand where this stands.',
  'I kept screenshots of what I saw and I can send them if they help.',
  'I went back through my earlier messages to make sure I gave you everything.',
  'There is one detail I forgot to mention before, and I am adding it now.',
  'I would rather know the real situation than receive a quick answer.',
  'I have been a student here for some time and this has not happened to me before.',
  'I am happy to try another step if you tell me exactly what to do.',
  'Please let me know if you need any other information from me.',
  'I will check my inbox again later today and tomorrow morning.',
  'Thank you again for staying on this with me.',
]

// Each message is a greeting, an opening line, 16 numbered lines, and a two-line closing (at least 20 lines).
function buildBody(index: number, byAgent: boolean): string {
  const pool = byAgent ? agentSteps : customerPoints
  const step = Math.floor(index / 2) + 1
  const lines = [
    byAgent ? `Hi ${first},` : `Hello ${agentName},`,
    byAgent
      ? `Here is update number ${step} about "${ticket!.subject}".`
      : `This is my reply number ${step} about "${ticket!.subject}".`,
    '',
  ]
  // Start at a different point of the pool each time so the messages read differently.
  for (let i = 0; i < 16; i++) lines.push(`${i + 1}. ${pool[(step * 3 + i) % pool.length]}`)
  lines.push(
    '',
    byAgent
      ? `Please tell me how this looks on your side, ${first}.`
      : 'Please let me know what you find out.',
    byAgent ? `Kind regards,\n${agentName}` : `Thanks,\n${first}`,
  )
  return lines.join('\n')
}

const startsWithAgent = last?.senderType !== 'agent'
const start = (last?.createdAt.getTime() ?? Date.now()) + HOUR

const messages = Array.from({ length: REPLIES }, (_, i) => {
  const byAgent = startsWithAgent ? i % 2 === 0 : i % 2 === 1
  return {
    ticketId,
    direction: byAgent ? ('outbound' as const) : ('inbound' as const),
    senderType: byAgent ? ('agent' as const) : ('customer' as const),
    fromEmail: byAgent ? agentEmail : ticket.senderEmail,
    body: buildBody(i, byAgent),
    messageId: `<seed-thread-${ticketId}-${i + 1}@seed-thread.example>`,
    createdAt: new Date(start + i * 3 * HOUR),
  }
})

await prisma.message.createMany({ data: messages })

const shortest = Math.min(...messages.map((m) => m.body.split('\n').length))
console.log(
  `Ticket ${ticketId}: removed ${removed.count} old seeded replies, added ${messages.length} (${startsWithAgent ? 'agent' : 'customer'} first, alternating, at least ${shortest} lines each).`,
)

await prisma.$disconnect()
