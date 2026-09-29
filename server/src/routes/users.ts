import { Router } from 'express'
import { createUserSchema } from 'core'
import { z } from 'zod'
import { auth } from '../auth.js'
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

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create an agent account (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 3 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: The created user
 *       400:
 *         description: Invalid body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       409:
 *         description: Email already in use
 */
usersRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues })
    return
  }
  const { name, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    res.status(409).json({ error: 'A user with this email already exists' })
    return
  }

  // No role passed: the admin plugin's defaultRole ('agent') applies, so this can't make an admin.
  const { user } = await auth.api.createUser({ body: { name, email, password } })

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned ?? false,
      createdAt: user.createdAt,
    },
  })
})
