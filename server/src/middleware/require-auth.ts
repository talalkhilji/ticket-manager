import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'

// Any signed-in, non-deleted user (admin or agent). Deleted users are banned and lose their sessions.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  next()
}
