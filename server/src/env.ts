import 'dotenv/config'
import { z } from 'zod'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CLIENT_URL: z.url().default('http://localhost:5173'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    for (const key of ['BETTER_AUTH_URL', 'CLIENT_URL'] as const) {
      if (!env[key].startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'must use https in production' })
      }
    }
  })

export const env = envSchema.parse(process.env)
