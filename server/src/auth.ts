import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin, openAPI } from 'better-auth/plugins'
import { prisma } from './db.js'
import { env } from './env.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ['admin', 'agent'],
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'agent',
      adminRoles: ['admin'],
    }),
    openAPI(),
  ],
})
