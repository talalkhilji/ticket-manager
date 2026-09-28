import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError } from 'better-auth/api'
import { admin, openAPI } from 'better-auth/plugins'
import { prisma } from './db.js'
import { env } from './env.js'

const isProduction = env.NODE_ENV === 'production'

// Only one admin exists (the seeded one). Once it does, no one can create or promote another.
async function assertNoOtherAdmin(role: unknown) {
  if (role !== 'admin') return
  if ((await prisma.user.count({ where: { role: 'admin' } })) > 0) {
    throw new APIError('FORBIDDEN', { message: 'An admin account already exists' })
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.CLIENT_URL],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 8,
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  rateLimit: {
    // Off under test: e2e runs sign in far more than 5 times a minute.
    enabled: env.NODE_ENV !== 'test',
    storage: 'database',
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
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
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await assertNoOtherAdmin((user as { role?: unknown }).role)
        },
      },
      update: {
        before: async (data) => {
          await assertNoOtherAdmin((data as { role?: unknown }).role)
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'agent',
      adminRoles: ['admin'],
      allowImpersonatingAdmins: false,
    }),
    // The OpenAPI reference lists every auth and admin endpoint; keep it out of production.
    ...(isProduction ? [] : [openAPI()]),
  ],
})
