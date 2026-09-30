import { Router } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { createUserSchema, updateUserSchema } from 'core'
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

  // Soft-deleted users never show up.
  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

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
 * /api/users/agents:
 *   get:
 *     summary: List every active agent, for choosing a ticket assignee (admin only)
 *     responses:
 *       200:
 *         description: Agents sorted by name
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
usersRouter.get('/agents', requireAdmin, async (_req, res) => {
  const agents = await prisma.user.findMany({
    where: { role: 'agent', deletedAt: null, banned: { not: true } },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  res.json({ agents })
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

const userIdParam = z.object({ id: z.string().min(1) })

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     summary: Update a user's name, email and optionally password (admin only)
 *     description: An empty or missing password leaves the current password unchanged.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string, minLength: 3 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: The updated user
 *       400:
 *         description: Invalid body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already in use
 */
usersRouter.patch('/:id', requireAdmin, async (req, res) => {
  const params = userIdParam.safeParse(req.params)
  const body = updateUserSchema.safeParse(req.body)
  if (!params.success || !body.success) {
    const issues = [...(params.error?.issues ?? []), ...(body.error?.issues ?? [])]
    res.status(400).json({ error: 'Invalid request', issues })
    return
  }
  const { id: userId } = params.data
  const { name, password } = body.data
  const email = body.data.email.toLowerCase()

  const existing = await prisma.user.findUnique({ where: { id: userId } })
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const emailOwner = await prisma.user.findUnique({ where: { email } })
  if (emailOwner && emailOwner.id !== userId) {
    res.status(409).json({ error: 'A user with this email already exists' })
    return
  }

  // Both admin endpoints check the caller's session, so pass the request headers through.
  const headers = fromNodeHeaders(req.headers)
  await auth.api.adminUpdateUser({ body: { userId, data: { name, email } }, headers })
  if (password) {
    await auth.api.setUserPassword({ body: { userId, newPassword: password }, headers })
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, banned: true, createdAt: true },
  })
  res.json({ user })
})

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Soft-delete a user (admin only)
 *     description: >
 *       Marks the user deleted, frees their email, bans them and ends their sessions.
 *       The row is kept. Admin accounts cannot be deleted.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin, or the target is an admin
 *       404:
 *         description: User not found
 */
usersRouter.delete('/:id', requireAdmin, async (req, res) => {
  const params = userIdParam.safeParse(req.params)
  if (!params.success) {
    res.status(400).json({ error: 'Invalid request', issues: params.error.issues })
    return
  }
  const { id: userId } = params.data

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target || target.deletedAt) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (target.role === 'admin') {
    res.status(403).json({ error: 'Admin accounts cannot be deleted' })
    return
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        deletedEmail: target.email,
        // Frees the address for reuse while keeping the unique constraint satisfied.
        email: `deleted+${userId}@deleted.invalid`,
        banned: true,
        banReason: 'Deleted',
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ])

  res.status(204).end()
})
