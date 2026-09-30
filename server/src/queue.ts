import PgBoss from 'pg-boss'
import { env } from './env.js'
import { isClassifyConfigured } from './services/classify.js'
import { classifyTicketJob } from './services/tickets.js'

// pg-boss keeps its jobs in its own `pgboss` schema in the same database (created on start).
const boss = new PgBoss({ connectionString: env.DATABASE_URL })
boss.on('error', (err) => console.error('pg-boss error:', err.message))

const CLASSIFY_QUEUE = 'classify-ticket'
let started = false

// Starts the queue and, when an OpenAI key is set, the worker that classifies tickets.
export async function startQueue() {
  await boss.start()
  // 'short' allows one waiting job per singletonKey, so a ticket is never queued twice.
  await boss.createQueue(CLASSIFY_QUEUE, {
    name: CLASSIFY_QUEUE,
    policy: 'short',
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
  })
  started = true

  if (!isClassifyConfigured()) return
  await boss.work<{ ticketId: number }>(CLASSIFY_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      try {
        await classifyTicketJob(job.data.ticketId)
      } catch (err) {
        // Log the message only (never ticket content), then rethrow so pg-boss retries the job.
        console.error(`Classify failed for ticket ${job.data.ticketId}:`, err instanceof Error ? err.message : 'unknown error')
        throw err
      }
    }
  })
}

// Queues AI classification of a new ticket. Never throws: the ticket already exists and, if queuing
// fails, it simply stays uncategorised for an agent.
export async function enqueueClassifyTicket(ticketId: number): Promise<void> {
  if (!started || !isClassifyConfigured()) return
  try {
    await boss.send(CLASSIFY_QUEUE, { ticketId }, { singletonKey: String(ticketId) })
  } catch (err) {
    console.error(`Could not queue classification for ticket ${ticketId}:`, err instanceof Error ? err.message : 'unknown error')
  }
}

export async function stopQueue() {
  if (!started) return
  started = false
  await boss.stop({ graceful: true, timeout: 10_000 })
}
