import { test, expect } from '../support/fixtures'
import { newApi, signIn, uniqueEmail } from '../support/api'

test.describe('session cookie', () => {
  test('is httpOnly, SameSite=Lax, not Secure over http, scoped to / and lasts 8 hours', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)

    const res = await signIn(api, agent.email, agent.password)

    const setCookie = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
      .find((v) => v.startsWith('better-auth.session_token='))
    expect(setCookie, 'session cookie is set').toBeDefined()
    expect(setCookie).toMatch(/;\s*HttpOnly/i)
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i)
    expect(setCookie).toMatch(/;\s*Path=\//i)
    expect(setCookie).toMatch(/;\s*Max-Age=28800/i)
    // The test API runs over plain http, so the Secure flag is only for production.
    expect(setCookie).not.toMatch(/;\s*Secure/i)
    await api.dispose()
  })

  test('is not readable from page JavaScript', async ({ page, context, makeAgent }) => {
    const agent = await makeAgent()
    await page.goto('/login')
    await page.getByLabel('Email').fill(agent.email)
    await page.getByLabel('Password').fill(agent.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/')

    const visibleToScripts = await page.evaluate(() => document.cookie)
    const session = (await context.cookies()).find((c) => c.name === 'better-auth.session_token')

    expect(visibleToScripts).not.toContain('better-auth')
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false })
  })

  test('is cleared when signing out', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.post('/api/auth/sign-out', { data: {} })

    const setCookie = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
      .find((v) => v.startsWith('better-auth.session_token='))
    expect(setCookie).toMatch(/^better-auth\.session_token=;/)
    expect(setCookie).toMatch(/Max-Age=0/i)
    await api.dispose()
  })

  test('is not set by a failed sign-in', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)

    const res = await signIn(api, agent.email, 'wrong-password-123')

    expect(res.status()).toBe(401)
    expect(res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')).toHaveLength(0)
    await api.dispose()
  })
})

test.describe('response headers', () => {
  test('the API sends security headers and hides its framework', async ({ playwright }) => {
    const api = await newApi(playwright)

    const res = await api.get('/api/health')
    const headers = res.headers()

    expect(headers['x-powered-by']).toBeUndefined()
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['referrer-policy']).toBe('no-referrer')
    await api.dispose()
  })

  test('auth endpoints carry the same security headers', async ({ playwright }) => {
    const api = await newApi(playwright)

    const res = await api.get('/api/auth/get-session')

    expect(res.headers()['x-content-type-options']).toBe('nosniff')
    expect(res.headers()['x-powered-by']).toBeUndefined()
    await api.dispose()
  })
})

test.describe('bad input never causes a server error or leaks internals', () => {
  const secretsPattern = /node_modules|\.ts:\d+|\.js:\d+|PrismaClient|at \w+ \(|password hash/i

  test('malformed and odd request bodies get a 4xx with no stack trace', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    const json = { 'content-type': 'application/json' }
    const cases: Array<{ name: string; options: Parameters<typeof api.post>[1] }> = [
      { name: 'malformed JSON', options: { headers: json, data: '{"email": ' } },
      { name: 'empty body', options: { headers: json, data: '' } },
      { name: 'JSON null', options: { headers: json, data: 'null' } },
      { name: 'JSON array', options: { data: [1, 2, 3] } },
      { name: 'JSON string', options: { headers: json, data: '"just a string"' } },
      { name: 'numbers instead of strings', options: { data: { email: 1, password: 2 } } },
      { name: 'objects instead of strings', options: { data: { email: {}, password: [] } } },
      { name: 'null values', options: { data: { email: null, password: null } } },
      { name: 'missing password', options: { data: { email: agent.email } } },
      { name: 'missing email', options: { data: { password: agent.password } } },
      { name: 'empty strings', options: { data: { email: '', password: '' } } },
      {
        name: 'SQL-looking input',
        options: { data: { email: `' OR '1'='1@e2e.test`, password: `' OR '1'='1` } },
      },
      {
        name: 'null bytes and control characters',
        options: { data: { email: `a\u0000b@e2e.test`, password: `\u0000\u0007` } },
      },
      {
        name: 'unicode',
        options: { data: { email: 'ünïcödé@e2e.test', password: '密码密码密码密码密码密码' } },
      },
    ]

    for (const { name, options } of cases) {
      const res = await api.post('/api/auth/sign-in/email', options)
      const text = await res.text()
      expect(res.status(), name).toBeGreaterThanOrEqual(400)
      expect(res.status(), name).toBeLessThan(500)
      expect(text, name).not.toMatch(secretsPattern)
    }
    await api.dispose()
  })

  test('oversized email and password values are refused without a server error', async ({
    playwright,
  }) => {
    const api = await newApi(playwright)

    const res = await api.post('/api/auth/sign-in/email', {
      data: { email: `${'a'.repeat(100_000)}@e2e.test`, password: 'p'.repeat(1_000_000) },
    })

    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
    expect(await res.text()).not.toMatch(secretsPattern)
    // The server is still healthy afterwards.
    expect((await api.get('/api/health')).status()).toBe(200)
    await api.dispose()
  })

  test('an unsupported content type gets a 415', async ({ playwright }) => {
    const api = await newApi(playwright)

    const res = await api.post('/api/auth/sign-in/email', {
      headers: { 'content-type': 'text/plain' },
      data: 'email=a@b.test&password=whatever-password',
    })

    expect(res.status()).toBe(415)
    await api.dispose()
  })

  test('admin endpoints reject malformed bodies with a 4xx, not a 500', async ({
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const json = { 'content-type': 'application/json' }
    const bodies = [
      { url: '/api/auth/admin/create-user', options: { headers: json, data: '{oops' } },
      { url: '/api/auth/admin/create-user', options: { data: { email: 1, password: 2, name: 3 } } },
      { url: '/api/auth/admin/create-user', options: { data: [] } },
      { url: '/api/auth/admin/ban-user', options: { data: {} } },
      { url: '/api/auth/admin/ban-user', options: { data: { userId: { $ne: null } } } },
      { url: '/api/auth/admin/remove-user', options: { data: { userId: 42 } } },
      { url: '/api/auth/admin/set-user-password', options: { data: { userId: agent.id } } },
      { url: '/api/auth/admin/set-role', options: { data: { userId: agent.id } } },
    ]

    for (const { url, options } of bodies) {
      const res = await admin.post(url, options)
      expect(res.status(), `${url} ${JSON.stringify(options.data)}`).toBeGreaterThanOrEqual(400)
      expect(res.status(), `${url} ${JSON.stringify(options.data)}`).toBeLessThan(500)
    }
  })

  test('unknown auth routes and wrong methods return 404, not a stack trace', async ({
    playwright,
  }) => {
    const api = await newApi(playwright)

    for (const res of [
      await api.get('/api/auth/does-not-exist'),
      await api.get('/api/auth/sign-in/email'),
      await api.put('/api/auth/sign-in/email', { data: {} }),
      await api.delete('/api/auth/admin/list-users'),
    ]) {
      expect(res.status()).toBeGreaterThanOrEqual(400)
      expect(res.status()).toBeLessThan(500)
      expect(await res.text()).not.toMatch(secretsPattern)
    }
    await api.dispose()
  })

  test('a server error during sign-in shows a message and keeps the form usable', async ({
    page,
  }) => {
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )

    await page.goto('/login')
    await page.getByLabel('Email').fill(uniqueEmail('server-down'))
    await page.getByLabel('Password').fill('some-password-here')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(/Could not sign in\.|Internal Server Error/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
