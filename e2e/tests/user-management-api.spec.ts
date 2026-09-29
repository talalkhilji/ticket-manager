import { test, expect } from '../support/fixtures'
import {
  bodyOf,
  newApi,
  sessionOf,
  signIn,
  strongPassword,
  uniqueEmail,
  uniqueSuffix,
} from '../support/api'

test.describe('creating users', () => {
  test('a new user defaults to the agent role and can sign in', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    const res = await admin.get(`/api/auth/admin/get-user?id=${agent.id}`)
    expect(((await res.json()) as { role: string }).role).toBe('agent')

    const api = await newApi(playwright)
    expect((await signIn(api, agent.email, agent.password)).status()).toBe(200)
    expect((await sessionOf(api))?.user.role).toBe('agent')
    await api.dispose()
  })

  test('an explicit agent role is accepted', async ({ admin }) => {
    const email = uniqueEmail('explicit')

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email, password: strongPassword(), name: 'Explicit Agent', role: 'agent' },
    })

    expect(res.status()).toBe(200)
    const { user } = (await res.json()) as { user: { id: string; role: string } }
    expect(user.role).toBe('agent')
    await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
  })

  test('the email is stored in lower case', async ({ admin }) => {
    const suffix = uniqueSuffix()
    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: `MiXeD-${suffix}@E2E.test`, password: strongPassword(), name: 'Mixed Case' },
    })

    expect(res.status()).toBe(200)
    const { user } = (await res.json()) as { user: { id: string; email: string } }
    expect(user.email).toBe(`mixed-${suffix}@e2e.test`)
    await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
  })

  test('a duplicate email is rejected', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: agent.email, password: strongPassword(), name: 'Copy' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
  })

  test('a duplicate email that differs only in case is rejected', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: agent.email.toUpperCase(), password: strongPassword(), name: 'Copy' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
  })

  test('the seeded admin email cannot be reused', async ({ admin, adminCredentials }) => {
    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: adminCredentials.email, password: strongPassword(), name: 'Impostor' },
    })

    expect(res.status()).toBe(400)
  })

  test('an invalid email is rejected', async ({ admin }) => {
    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: 'not-an-email', password: strongPassword(), name: 'Bad Email' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('INVALID_EMAIL')
  })

  test('a missing name is rejected', async ({ admin }) => {
    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: uniqueEmail('noname'), password: strongPassword() },
    })

    expect(res.status()).toBe(400)
  })

  test('a user created without a password exists but cannot sign in', async ({
    playwright,
    admin,
  }) => {
    // better-auth allows a password-less account; it has no credential, so nobody can log in as it.
    const email = uniqueEmail('nopass')

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email, name: 'No Password' },
    })

    expect(res.status()).toBe(200)
    const { user } = (await res.json()) as { user: { id: string; role: string } }
    expect(user.role).toBe('agent')
    const api = await newApi(playwright)
    expect((await signIn(api, email, 'any-password-at-all')).status()).toBe(401)
    expect((await signIn(api, email, '')).status()).toBeGreaterThanOrEqual(400)
    await api.dispose()
    await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
  })

  // BUG (see report): the admin create-user endpoint does not enforce minPasswordLength (12), so
  // an 8 character password is accepted. test.fail() keeps the suite green while the bug exists and
  // turns red once it is fixed (then remove test.fail()).
  test('create-user rejects a password shorter than 12 characters', async ({ admin }) => {
    test.fail()
    const email = uniqueEmail('short')

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email, password: 'short-pw', name: 'Short Password' },
    })
    if (res.ok()) {
      const { user } = (await res.json()) as { user: { id: string } }
      await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
    }

    expect(res.status()).toBe(400)
  })

  test('create-user accepts a password of exactly 12 characters', async ({ playwright, admin }) => {
    const email = uniqueEmail('twelve')
    const password = 'abcdefghij12'

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email, password, name: 'Twelve' },
    })

    expect(res.status()).toBe(200)
    const { user } = (await res.json()) as { user: { id: string } }
    const api = await newApi(playwright)
    expect((await signIn(api, email, password)).status()).toBe(200)
    await api.dispose()
    await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
  })
})

test.describe('passwords', () => {
  test('set-user-password rejects 11 characters and accepts 12', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    const tooShort = await admin.post('/api/auth/admin/set-user-password', {
      data: { userId: agent.id, newPassword: 'abcdefghij1' },
    })
    expect(tooShort.status()).toBe(400)
    expect((await bodyOf(tooShort)).code).toBe('PASSWORD_TOO_SHORT')

    const ok = await admin.post('/api/auth/admin/set-user-password', {
      data: { userId: agent.id, newPassword: 'abcdefghij12' },
    })
    expect(ok.status()).toBe(200)

    const api = await newApi(playwright)
    expect((await signIn(api, agent.email, agent.password)).status()).toBe(401)
    expect((await signIn(api, agent.email, 'abcdefghij12')).status()).toBe(200)
    await api.dispose()
  })

  test('an agent changing their own password must give the right current password', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const wrong = await api.post('/api/auth/change-password', {
      data: { currentPassword: 'not-my-password-1', newPassword: 'a-new-long-password' },
    })

    expect(wrong.status()).toBe(400)
    const other = await newApi(playwright)
    expect((await signIn(other, agent.email, agent.password)).status()).toBe(200)
    await other.dispose()
    await api.dispose()
  })

  test('an agent cannot change their own password to one shorter than 12 characters', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/change-password', {
      data: { currentPassword: agent.password, newPassword: 'short' },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('PASSWORD_TOO_SHORT')
    await api.dispose()
  })

  test('an agent can change their own password and use the new one', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)
    const newPassword = strongPassword()

    const res = await api.post('/api/auth/change-password', {
      data: { currentPassword: agent.password, newPassword },
    })

    expect(res.status()).toBe(200)
    const fresh = await newApi(playwright)
    expect((await signIn(fresh, agent.email, agent.password)).status()).toBe(401)
    expect((await signIn(fresh, agent.email, newPassword)).status()).toBe(200)
    await fresh.dispose()
    await api.dispose()
  })
})

test.describe('only one admin may exist', () => {
  async function adminCount(admin: import('@playwright/test').APIRequestContext) {
    const res = await admin.get('/api/auth/admin/list-users?filterField=role&filterValue=admin')
    return ((await res.json()) as { total: number }).total
  }

  test('create-user with the admin role is refused', async ({ admin }) => {
    const email = uniqueEmail('second-admin')

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email, password: strongPassword(), name: 'Second Admin', role: 'admin' },
    })

    expect(res.status()).toBe(403)
    expect((await bodyOf(res)).message).toBe('An admin account already exists')
    const list = await admin.get(
      `/api/auth/admin/list-users?searchField=email&searchValue=${encodeURIComponent(email)}&searchOperator=contains`,
    )
    expect(((await list.json()) as { total: number }).total).toBe(0)
    expect(await adminCount(admin)).toBe(1)
  })

  test('create-user cannot smuggle the admin role through the data field', async ({ admin }) => {
    const res = await admin.post('/api/auth/admin/create-user', {
      data: {
        email: uniqueEmail('smuggled'),
        password: strongPassword(),
        name: 'Smuggled',
        data: { role: 'admin' },
      },
    })

    expect(res.status()).toBe(403)
    expect(await adminCount(admin)).toBe(1)
  })

  test('promoting an agent with set-role is refused and the agent stays an agent', async ({
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    const res = await admin.post('/api/auth/admin/set-role', {
      data: { userId: agent.id, role: 'admin' },
    })

    expect(res.status()).toBe(403)
    const user = await admin.get(`/api/auth/admin/get-user?id=${agent.id}`)
    expect(((await user.json()) as { role: string }).role).toBe('agent')
    expect(await adminCount(admin)).toBe(1)
  })

  test('promoting an agent with admin update-user is refused', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()

    const res = await admin.post('/api/auth/admin/update-user', {
      data: { userId: agent.id, data: { role: 'admin' } },
    })

    expect(res.status()).toBe(403)
    expect(await adminCount(admin)).toBe(1)
  })

  test('role strings that combine agent and admin do not create a second admin', async ({
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    for (const role of ['agent,admin', 'admin,agent', ['agent', 'admin']]) {
      const res = await admin.post('/api/auth/admin/set-role', { data: { userId: agent.id, role } })
      expect(res.ok(), `set-role ${JSON.stringify(role)}`).toBe(false)
    }
    const created = await admin.post('/api/auth/admin/create-user', {
      data: {
        email: uniqueEmail('combo'),
        password: strongPassword(),
        name: 'Combo',
        role: 'agent,admin',
      },
    })

    expect(created.ok()).toBe(false)
    const user = await admin.get(`/api/auth/admin/get-user?id=${agent.id}`)
    expect(((await user.json()) as { role: string }).role).toBe('agent')
    expect(await adminCount(admin)).toBe(1)
  })

  // BUG (see report): an unknown role makes better-auth hit a database enum error and the server
  // answers 500 instead of a 4xx. test.fail() keeps the suite green while the bug exists.
  test('an unknown role is rejected with a 4xx, not a server error', async ({
    admin,
    makeAgent,
  }) => {
    test.fail()
    const agent = await makeAgent()

    const res = await admin.post('/api/auth/admin/set-role', {
      data: { userId: agent.id, role: 'superuser' },
    })

    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('the seeded admin is the one and only admin', async ({ admin, adminCredentials }) => {
    const res = await admin.get('/api/auth/admin/list-users?filterField=role&filterValue=admin')

    const body = (await res.json()) as { total: number; users: Array<{ email: string }> }
    expect(body.total).toBe(1)
    expect(body.users[0].email).toBe(adminCredentials.email)
  })
})

test.describe('banning users', () => {
  test('a banned user cannot sign in, and unbanning restores access', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)

    const ban = await admin.post('/api/auth/admin/ban-user', {
      data: { userId: agent.id, banReason: 'e2e test' },
    })
    expect(ban.status()).toBe(200)

    const blocked = await signIn(api, agent.email, agent.password)
    expect(blocked.status()).toBe(403)
    expect((await bodyOf(blocked)).code).toBe('BANNED_USER')
    expect(await sessionOf(api)).toBeNull()

    const unban = await admin.post('/api/auth/admin/unban-user', { data: { userId: agent.id } })
    expect(unban.status()).toBe(200)
    expect((await signIn(api, agent.email, agent.password)).status()).toBe(200)
    expect((await sessionOf(api))?.user.email).toBe(agent.email)
    await api.dispose()
  })

  test('banning revokes the sessions the user already had', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)
    expect((await sessionOf(api))?.user.email).toBe(agent.email)

    await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })

    expect(await sessionOf(api)).toBeNull()
    await api.dispose()
  })

  test('a banned agent cannot use admin endpoints with an old session', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)
    await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })

    const res = await api.get('/api/auth/admin/list-users')

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('the admin cannot ban themselves', async ({ admin }) => {
    const session = await sessionOf(admin)

    const res = await admin.post('/api/auth/admin/ban-user', { data: { userId: session!.user.id } })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('YOU_CANNOT_BAN_YOURSELF')
    expect((await sessionOf(admin))?.user.role).toBe('admin')
  })

  test('banning or unbanning an unknown user returns 404', async ({ admin }) => {
    const ban = await admin.post('/api/auth/admin/ban-user', { data: { userId: 'no-such-user' } })
    expect(ban.status()).toBe(404)
  })
})

test.describe('removing users', () => {
  test('a removed user can no longer sign in and disappears from the list', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const removed = await admin.post('/api/auth/admin/remove-user', { data: { userId: agent.id } })
    expect(removed.status()).toBe(200)

    expect(await sessionOf(api)).toBeNull()
    const again = await signIn(api, agent.email, agent.password)
    expect(again.status()).toBe(401)
    expect((await bodyOf(again)).code).toBe('INVALID_EMAIL_OR_PASSWORD')
    const list = await admin.get(
      `/api/auth/admin/list-users?searchField=email&searchValue=${encodeURIComponent(agent.email)}&searchOperator=contains`,
    )
    expect(((await list.json()) as { total: number }).total).toBe(0)
    await api.dispose()
  })

  test('removing an unknown user returns 404', async ({ admin }) => {
    const res = await admin.post('/api/auth/admin/remove-user', {
      data: { userId: 'no-such-user' },
    })

    expect(res.status()).toBe(404)
  })

  test('the admin cannot remove themselves', async ({ admin }) => {
    const session = await sessionOf(admin)

    const res = await admin.post('/api/auth/admin/remove-user', {
      data: { userId: session!.user.id },
    })

    expect(res.status()).toBe(400)
    expect((await bodyOf(res)).code).toBe('YOU_CANNOT_REMOVE_YOURSELF')
    expect((await sessionOf(admin))?.user.role).toBe('admin')
  })

  test('the email of a removed user can be used again', async ({
    playwright,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await admin.post('/api/auth/admin/remove-user', { data: { userId: agent.id } })
    const password = strongPassword()

    const res = await admin.post('/api/auth/admin/create-user', {
      data: { email: agent.email, password, name: 'Second Life' },
    })

    expect(res.status()).toBe(200)
    const { user } = (await res.json()) as { user: { id: string } }
    const api = await newApi(playwright)
    expect((await signIn(api, agent.email, password)).status()).toBe(200)
    expect((await signIn(api, agent.email, agent.password)).status()).toBe(401)
    await api.dispose()
    await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
  })
})

test.describe('impersonation', () => {
  test('the admin cannot impersonate an admin', async ({ admin }) => {
    const session = await sessionOf(admin)

    const res = await admin.post('/api/auth/admin/impersonate-user', {
      data: { userId: session!.user.id },
    })

    expect(res.status()).toBe(403)
    expect((await bodyOf(res)).code).toBe('YOU_CANNOT_IMPERSONATE_ADMINS')
    expect((await sessionOf(admin))?.user.role).toBe('admin')
  })

  test('the admin can impersonate an agent and then stop', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()

    const start = await admin.post('/api/auth/admin/impersonate-user', {
      data: { userId: agent.id },
    })
    expect(start.status()).toBe(200)
    const impersonated = await sessionOf(admin)
    expect(impersonated?.user.email).toBe(agent.email)
    expect(impersonated?.user.role).toBe('agent')
    // While impersonating, the caller only has the agent's rights.
    expect((await admin.get('/api/auth/admin/list-users')).status()).toBe(403)

    const stop = await admin.post('/api/auth/admin/stop-impersonating', { data: {} })
    expect(stop.status()).toBe(200)
    expect((await sessionOf(admin))?.user.role).toBe('admin')
    expect((await admin.get('/api/auth/admin/list-users')).status()).toBe(200)
  })

  test('an impersonation session is short lived (about one hour)', async ({ admin, makeAgent }) => {
    const agent = await makeAgent()
    await admin.post('/api/auth/admin/impersonate-user', { data: { userId: agent.id } })

    const res = await admin.get('/api/auth/get-session')
    const { session } = (await res.json()) as { session: { expiresAt: string } }
    const remainingMs = new Date(session.expiresAt).getTime() - Date.now()

    expect(remainingMs).toBeGreaterThan(50 * 60 * 1000)
    expect(remainingMs).toBeLessThanOrEqual(60 * 60 * 1000)
  })
})
