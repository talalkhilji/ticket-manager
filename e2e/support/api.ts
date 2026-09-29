import { randomBytes } from 'node:crypto'
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type PlaywrightWorkerArgs,
} from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, CLIENT_URL } from './env'

export type TestUser = {
  id: string
  name: string
  email: string
  password: string
}

export function uniqueSuffix() {
  return randomBytes(5).toString('hex')
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${uniqueSuffix()}@e2e.test`
}

export function strongPassword() {
  return `Pw-${randomBytes(9).toString('hex')}`
}

/** A cookie-isolated API client that talks straight to the API with the trusted client origin. */
export async function newApi(
  playwright: PlaywrightWorkerArgs['playwright'],
  origin: string = CLIENT_URL,
) {
  return playwright.request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Origin: origin },
  })
}

export async function signIn(api: APIRequestContext, email: string, password: string) {
  return api.post('/api/auth/sign-in/email', { data: { email, password } })
}

export async function signInAsAdmin(playwright: PlaywrightWorkerArgs['playwright']) {
  const api = await newApi(playwright)
  const res = await signIn(api, ADMIN_EMAIL, ADMIN_PASSWORD)
  expect(res.status(), 'seeded admin can sign in').toBe(200)
  return api
}

export async function createUser(
  admin: APIRequestContext,
  overrides: Partial<Omit<TestUser, 'id'>> & { role?: string } = {},
): Promise<TestUser> {
  const suffix = uniqueSuffix()
  const user = {
    name: overrides.name ?? `E2E Agent ${suffix}`,
    email: overrides.email ?? `agent-${suffix}@e2e.test`,
    password: overrides.password ?? strongPassword(),
  }
  const res = await admin.post('/api/auth/admin/create-user', {
    data: { ...user, ...(overrides.role ? { role: overrides.role } : {}) },
  })
  expect(res.status(), `create-user: ${await res.text()}`).toBe(200)
  const body = (await res.json()) as { user: { id: string } }
  return { ...user, id: body.user.id }
}

export async function sessionOf(api: APIRequestContext) {
  const res = await api.get('/api/auth/get-session')
  expect(res.status()).toBe(200)
  return (await res.json()) as null | {
    user: { id: string; email: string; name: string; role: string }
  }
}

export async function bodyOf(res: APIResponse) {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}
