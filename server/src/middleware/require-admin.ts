import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'

// Checks the role on the server for every admin endpoint; the client guard is only a convenience.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (session.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' })
    return
  }
  next()
}
