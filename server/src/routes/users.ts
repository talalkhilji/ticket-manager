import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAdmin } from '../middleware/require-admin.js'

export const usersRouter = Router()

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
})

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List users (admin only)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         description: Case-insensitive match on name or email
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: A page of users
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
usersRouter.get('/', requireAdmin, async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues })
    return
  }
  const { page, pageSize, search } = parsed.data

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, banned: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  res.json({ users, total, page, pageSize })
})
