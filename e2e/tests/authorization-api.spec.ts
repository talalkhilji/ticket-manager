import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../support/fixtures'
import { bodyOf, newApi, sessionOf, signIn, uniqueEmail } from '../support/api'

type Endpoint = {
  name: string
  method: 'GET' | 'POST'
  url: (victimId: string) => string
  data?: (victimId: string) => Record<string, unknown>
}

// Every admin-only endpoint the admin plugin exposes. The victim is a real agent, so if an
// unauthorised call worked we would see it in the victim's state afterwards.
const adminEndpoints: Endpoint[] = [
  { name: 'list-users', method: 'GET', url: () => '/api/auth/admin/list-users' },
  { name: 'get-user', method: 'GET', url: (id) => `/api/auth/admin/get-user?id=${id}` },
  {
    name: 'create-user',
    method: 'POST',
    url: () => '/api/auth/admin/create-user',
    data: () => ({
      email: uniqueEmail('created'),
      password: 'a-long-enough-password',
      name: 'Nope',
    }),
  },
  {
    name: 'set-role',
    method: 'POST',
    url: () => '/api/auth/admin/set-role',
    data: (userId) => ({ userId, role: 'admin' }),
  },
  {
    name: 'update-user',
    method: 'POST',
    url: () => '/api/auth/admin/update-user',
    data: (userId) => ({ userId, data: { name: 'Hacked' } }),
  },
  {
    name: 'ban-user',
    method: 'POST',
    url: () => '/api/auth/admin/ban-user',
    data: (userId) => ({ userId }),
  },
  {
    name: 'unban-user',
    method: 'POST',
    url: () => '/api/auth/admin/unban-user',
    data: (userId) => ({ userId }),
  },
  {
    name: 'list-user-sessions',
    method: 'POST',
    url: () => '/api/auth/admin/list-user-sessions',
    data: (userId) => ({ userId }),
  },
  {
    name: 'revoke-user-session',
    method: 'POST',
    url: () => '/api/auth/admin/revoke-user-session',
    data: () => ({ sessionToken: 'anything' }),
  },
  {
    name: 'revoke-user-sessions',
    method: 'POST',
    url: () => '/api/auth/admin/revoke-user-sessions',
    data: (userId) => ({ userId }),
  },
  {
    name: 'impersonate-user',
    method: 'POST',
    url: () => '/api/auth/admin/impersonate-user',
    data: (userId) => ({ userId }),
  },
  {
    name: 'set-user-password',
    method: 'POST',
    url: () => '/api/auth/admin/set-user-password',
    data: (userId) => ({ userId, newPassword: 'a-brand-new-password' }),
  },
  {
    name: 'remove-user',
    method: 'POST',
    url: () => '/api/auth/admin/remove-user',
    data: (userId) => ({ userId }),
  },
]

function call(api: APIRequestContext, endpoint: Endpoint, victimId: string) {
  return api.fetch(endpoint.url(victimId), {
    method: endpoint.method,
    data: endpoint.data?.(victimId),
  })
}

test.describe('admin endpoints reject unauthenticated callers', () => {
  for (const endpoint of adminEndpoints) {
    test(`${endpoint.name} returns 401`, async ({ playwright, makeAgent }) => {
      const victim = await makeAgent()
      const anonymous = await newApi(playwright)

      const res = await call(anonymous, endpoint, victim.id)

      expect(res.status()).toBe(401)
      await anonymous.dispose()
    })
  }
})

test.describe('admin endpoints reject agents', () => {
  for (const endpoint of adminEndpoints) {
    test(`${endpoint.name} returns 403 for an agent`, async ({ playwright, makeAgent }) => {
      const attacker = await makeAgent()
      const victim = await makeAgent()
      const api = await newApi(playwright)
      await signIn(api, attacker.email, attacker.password)

      const res = await call(api, endpoint, victim.id)

      expect(res.status()).toBe(403)
      await api.dispose()
    })
  }

  test('a blocked agent leaves the victim account untouched', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const attacker = await makeAgent()
    const victim = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, attacker.email, attacker.password)

    for (const endpoint of adminEndpoints) {
      await call(api, endpoint, victim.id)
    }

    const res = await admin.get(`/api/auth/admin/get-user?id=${victim.id}`)
    expect(res.status()).toBe(200)
    const user = (await res.json()) as { name: string; role: string; banned: boolean }
    expect(user).toMatchObject({ name: victim.name, role: 'agent', banned: false })
    // The victim's password is unchanged and the account still exists.
    const victimApi = await newApi(playwright)
    expect((await signIn(victimApi, victim.email, victim.password)).status()).toBe(200)
    await victimApi.dispose()
    await api.dispose()
  })

  test('the 403 body does not leak user data', async ({ playwright, admin, makeAgent }) => {
    const attacker = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, attacker.email, attacker.password)

    const res = await api.get('/api/auth/admin/list-users')
    const text = await res.text()

    expect(res.status()).toBe(403)
    expect(text).not.toContain('@e2e.test')
    expect(text).not.toContain('"users"')
    expect((await admin.get('/api/auth/admin/list-users')).status()).toBe(200)
    await api.dispose()
  })
})

test.describe('admin endpoints accept the admin', () => {
  test('list-users returns users without password data', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()

    const res = await admin.get('/api/auth/admin/list-users?limit=100')

    expect(res.status()).toBe(200)
    const body = (await res.json()) as { users: Array<Record<string, unknown>>; total: number }
    expect(body.users.map((u) => u.email)).toContain(agent.email)
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i)
  })

  test('get-user, update-user, ban-user, unban-user and set-user-password succeed', async ({
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    expect((await admin.get(`/api/auth/admin/get-user?id=${agent.id}`)).status()).toBe(200)
    const renamed = await admin.post('/api/auth/admin/update-user', {
      data: { userId: agent.id, data: { name: 'Renamed Agent' } },
    })
    expect(renamed.status()).toBe(200)
    expect((await bodyOf(renamed)).name).toBe('Renamed Agent')
    expect(
      (await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })).status(),
    ).toBe(200)
    expect(
      (await admin.post('/api/auth/admin/unban-user', { data: { userId: agent.id } })).status(),
    ).toBe(200)
    expect(
      (
        await admin.post('/api/auth/admin/set-user-password', {
          data: { userId: agent.id, newPassword: 'another-long-password' },
        })
      ).status(),
    ).toBe(200)
  })

  test('list-user-sessions and revoke-user-sessions work on an agent', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const agentApi = await newApi(playwright)
    await signIn(agentApi, agent.email, agent.password)

    const list = await admin.post('/api/auth/admin/list-user-sessions', {
      data: { userId: agent.id },
    })
    expect(list.status()).toBe(200)
    expect(((await list.json()) as { sessions: unknown[] }).sessions.length).toBeGreaterThan(0)

    const revoke = await admin.post('/api/auth/admin/revoke-user-sessions', {
      data: { userId: agent.id },
    })
    expect(revoke.status()).toBe(200)
    expect(await sessionOf(agentApi)).toBeNull()
    await agentApi.dispose()
  })
})

test.describe('an agent cannot escalate their own privileges', () => {
  test('set-role to admin is forbidden and the role stays agent', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/admin/set-role', {
      data: { userId: agent.id, role: 'admin' },
    })

    expect(res.status()).toBe(403)
    expect((await sessionOf(api))?.user.role).toBe('agent')
    await api.dispose()
  })

  test('update-user refuses a role field', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/update-user', { data: { role: 'admin' } })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('FIELD_NOT_ALLOWED')
    expect((await sessionOf(api))?.user.role).toBe('agent')
    await api.dispose()
  })

  test('update-user with a name and a role changes neither', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/update-user', {
      data: { name: 'Sneaky', role: 'admin' },
    })

    expect(res.status()).toBe(400)
    const session = await sessionOf(api)
    expect(session?.user.role).toBe('agent')
    expect(session?.user.name).toBe(agent.name)
    await api.dispose()
  })

  test('update-user still lets an agent change their own name', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/update-user', { data: { name: 'New Display Name' } })

    expect(res.status()).toBe(200)
    const session = await sessionOf(api)
    expect(session?.user.name).toBe('New Display Name')
    expect(session?.user.role).toBe('agent')
    await api.dispose()
  })

  test('an agent cannot change their own email', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/change-email', {
      data: { newEmail: uniqueEmail('moved') },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('CHANGE_EMAIL_DISABLED')
    await api.dispose()
  })

  test('an agent cannot delete their own account through the public API', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/delete-user', { data: {} })

    expect(res.status()).toBe(404)
    expect((await sessionOf(api))?.user.email).toBe(agent.email)
    await api.dispose()
  })

  test('an agent cannot stop-impersonate their way into another session', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/admin/stop-impersonating', { data: {} })

    expect(res.status()).toBe(400)
    expect((await sessionOf(api))?.user.email).toBe(agent.email)
    await api.dispose()
  })
})

test.describe('public sign-up is disabled', () => {
  test('sign-up returns 400 EMAIL_PASSWORD_SIGN_UP_DISABLED and creates nothing', async ({
    playwright,
  }) => {
    const anonymous = await newApi(playwright)
    const email = uniqueEmail('signup')
    const password = 'a-perfectly-good-password'

    const res = await anonymous.post('/api/auth/sign-up/email', {
      data: { email, password, name: 'Sneaky' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')
    expect((await signIn(anonymous, email, password)).status()).toBe(401)
    await anonymous.dispose()
  })

  test('sign-up cannot be used to register an admin', async ({ playwright }) => {
    const anonymous = await newApi(playwright)

    const res = await anonymous.post('/api/auth/sign-up/email', {
      data: {
        email: uniqueEmail('signup-admin'),
        password: 'a-perfectly-good-password',
        name: 'Sneaky',
        role: 'admin',
      },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')
    await anonymous.dispose()
  })

  test('sign-up stays disabled for a signed-in agent', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/sign-up/email', {
      data: { email: uniqueEmail('signup'), password: 'a-perfectly-good-password', name: 'Sneaky' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')
    await api.dispose()
  })

  test('the password reset flow is not enabled', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const anonymous = await newApi(playwright)

    const res = await anonymous.post('/api/auth/request-password-reset', {
      data: { email: agent.email },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('RESET_PASSWORD_DISABLED')
    await anonymous.dispose()
  })
})
