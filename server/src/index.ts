import express, { type NextFunction, type Request, type Response } from 'express'
import swaggerUi from 'swagger-ui-express'
import { toNodeHandler } from 'better-auth/node'
import helmet from 'helmet'
import { auth } from './auth.js'
import { env } from './env.js'
import { usersRouter } from './routes/users.js'
import { openapiSpec } from './swagger.js'

const app = express()
const port = env.PORT

app.disable('x-powered-by')
app.use(helmet())

app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())

if (env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec))
}

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/users', usersRouter)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
