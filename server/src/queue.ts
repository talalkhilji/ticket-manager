import PgBoss from 'pg-boss'
import { env } from './env.js'
import { autoResolveTicketJob, releaseStuckTickets, releaseTicket } from './services/auto-resolve.js'
import { isClassifyConfigured } from './services/classify.js'
import { isAutoResolveEnabled } from './services/knowledge-base.js'
import { classifyTicketJob } from './services/tickets.js'

// pg-boss keeps its jobs in its own `pgboss` schema in the same database (created on start).
const boss = new PgBoss({ connectionString: env.DATABASE_URL })
boss.on('error', (err) => console.error('pg-boss error:', err.message))

const CLASSIFY_QUEUE = 'classify-ticket'
const AUTO_RESOLVE_QUEUE = 'auto-resolve-ticket'
const SWEEP_EVERY_MS = 5 * 60_000
let started = false
let sweepTimer: NodeJS.Timeout | undefined

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'unknown error')

// 'short' allows one waiting job per singletonKey, so a ticket is never queued twice.
const queueOptions = (name: string) => ({
  name,
  policy: 'short' as const,
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 120,
})

// Tickets stuck waiting for the AI (a crash, a missing worker) go to the agents so they never stay hidden.
async function sweep(olderThanMinutes: number) {
  try {
    const released = await releaseStuckTickets(olderThanMinutes)
    if (released > 0) console.log(`Released ${released} ticket(s) stuck waiting for the AI.`)
  } catch (err) {
    console.error('Could not release stuck tickets:', errorText(err))
  }
}

// Starts the queue and, when an OpenAI key is set, the workers that classify and auto-resolve tickets.
export async function startQueue() {
  await boss.start()
  await boss.createQueue(CLASSIFY_QUEUE, queueOptions(CLASSIFY_QUEUE))
  await boss.createQueue(AUTO_RESOLVE_QUEUE, queueOptions(AUTO_RESOLVE_QUEUE))
  started = true

  // Without auto-resolve nothing will ever move these on, so hand them over straight away.
  await sweep(isAutoResolveEnabled() ? 10 : 0)
  sweepTimer = setInterval(() => void sweep(10), SWEEP_EVERY_MS)
  sweepTimer.unref()

  if (isClassifyConfigured()) {
    await boss.work<{ ticketId: number }>(CLASSIFY_QUEUE, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await classifyTicketJob(job.data.ticketId)
        } catch (err) {
          // Log the message only (never ticket content), then rethrow so pg-boss retries the job.
          console.error(`Classify failed for ticket ${job.data.ticketId}:`, errorText(err))
          throw err
        }
      }
    })
  }

  if (isAutoResolveEnabled()) {
    await boss.work<{ ticketId: number }>(
      AUTO_RESOLVE_QUEUE,
      { batchSize: 1, includeMetadata: true },
      async (jobs) => {
        for (const job of jobs) {
          try {
            await autoResolveTicketJob(job.data.ticketId)
          } catch (err) {
            console.error(`Auto-resolve failed for ticket ${job.data.ticketId}:`, errorText(err))
            // Out of retries: give the ticket to the agents instead of leaving it hidden.
            if (job.retryCount >= job.retryLimit) await releaseTicket(job.data.ticketId).catch(() => {})
            throw err
          }
        }
      },
    )
  }
}

// Queues AI classification of a new ticket. Never throws: the ticket already exists and, if queuing
// fails, it simply stays uncategorised for an agent.
export async function enqueueClassifyTicket(ticketId: number): Promise<void> {
  if (!started || !isClassifyConfigured()) return
  try {
    await boss.send(CLASSIFY_QUEUE, { ticketId }, { singletonKey: String(ticketId) })
  } catch (err) {
    console.error(`Could not queue classification for ticket ${ticketId}:`, errorText(err))
  }
}

// Queues the knowledge-base attempt for a ticket created as `new`. Never throws: if queuing fails the
// ticket goes straight to the agents.
export async function enqueueAutoResolveTicket(ticketId: number): Promise<void> {
  try {
    if (!started || !isAutoResolveEnabled()) throw new Error('auto-resolve is not running')
    await boss.send(AUTO_RESOLVE_QUEUE, { ticketId }, { singletonKey: String(ticketId) })
  } catch (err) {
    console.error(`Could not queue auto-resolve for ticket ${ticketId}:`, errorText(err))
    await releaseTicket(ticketId).catch(() => {})
  }
}

export async function stopQueue() {
  if (!started) return
  started = false
  clearInterval(sweepTimer)
  await boss.stop({ graceful: true, timeout: 10_000 })
}
