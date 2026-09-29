import { test, expect } from '../support/fixtures'
import { newApi, sessionOf, signIn } from '../support/api'
import { CLIENT_URL } from '../support/env'
import { expectOnLoginPage, fillLoginForm, loginThroughUi, submitLoginForm } from '../support/ui'

test.describe('session lifetime and persistence', () => {
  test('the session survives a page reload', async ({ page, makeAgent }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    await page.reload()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
  })

  test('the session is shared with a new tab in the same browser', async ({
    page,
    context,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    const secondTab = await context.newPage()
    await secondTab.goto('/')

    await expect(secondTab).toHaveURL('/')
    await expect(secondTab.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
  })

  test('the session survives client-side navigation between pages', async ({
    page,
    signInPage,
    adminCredentials,
  }) => {
    await signInPage(page, adminCredentials.email, adminCredentials.password)

    await page.goto('/')
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL(/\/users$/)
    await page.getByRole('link', { name: 'Ticket Manager' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
  })

  test('the API session expires in 8 hours', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    const res = await api.get('/api/auth/get-session')
    const body = (await res.json()) as { session: { expiresAt: string } }
    const remainingMs = new Date(body.session.expiresAt).getTime() - Date.now()

    const eightHours = 8 * 60 * 60 * 1000
    expect(remainingMs).toBeGreaterThan(eightHours - 5 * 60 * 1000)
    expect(remainingMs).toBeLessThanOrEqual(eightHours)
    await api.dispose()
  })

  test('a session cookie that was tampered with is treated as signed out', async ({
    page,
    context,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)
    const [cookie] = (await context.cookies()).filter((c) => c.name === 'better-auth.session_token')
    await context.clearCookies()
    await context.addCookies([{ ...cookie, value: `${cookie.value.slice(0, -4)}AAAA` }])

    await page.goto('/')

    await expectOnLoginPage(page)
  })

  test('a made-up session cookie is treated as signed out by the API', async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: CLIENT_URL,
      extraHTTPHeaders: { Cookie: 'better-auth.session_token=totally-made-up.value' },
    })

    expect(await sessionOf(api)).toBeNull()
    const res = await api.get('/api/auth/admin/list-users')
    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('the raw session token without its signature is not accepted', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    const res = await signIn(api, agent.email, agent.password)
    const { token } = (await res.json()) as { token: string }

    const forged = await playwright.request.newContext({
      baseURL: CLIENT_URL,
      extraHTTPHeaders: { Cookie: `better-auth.session_token=${token}` },
    })

    expect(await sessionOf(forged)).toBeNull()
    await forged.dispose()
    await api.dispose()
  })
})

test.describe('logging out', () => {
  test('signing out returns to the login page and ends the session', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expectOnLoginPage(page)
    expect(await sessionOf(page.request)).toBeNull()

    await page.goto('/')
    await expectOnLoginPage(page)
  })

  test('after signing out the old session cookie no longer works', async ({
    page,
    context,
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)
    const cookiesBefore = await context.cookies()
    const oldApi = await playwright.request.newContext({
      baseURL: CLIENT_URL,
      storageState: { cookies: cookiesBefore, origins: [] },
    })
    expect((await sessionOf(oldApi))?.user.email).toBe(agent.email)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(page)

    // Replaying the captured cookie proves the session was revoked on the server, not just cleared.
    expect(await sessionOf(oldApi)).toBeNull()
    await oldApi.dispose()
  })

  test('the Back button after signing out does not reveal protected content', async ({
    page,
    signInPage,
    adminCredentials,
  }) => {
    await signInPage(page, adminCredentials.email, adminCredentials.password)
    await page.goto('/')
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(page)

    await page.goBack()

    await expectOnLoginPage(page)
    await expect(page.getByRole('heading', { name: /Welcome/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  })

  test('signing out in one tab signs out the other tab on its next load', async ({
    page,
    context,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)
    const secondTab = await context.newPage()
    await secondTab.goto('/')
    await expect(secondTab.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(page)
    await secondTab.reload()

    await expectOnLoginPage(secondTab)
  })

  test('signing out twice is harmless', async ({ playwright, makeAgent }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)
    await signIn(api, agent.email, agent.password)

    expect((await api.post('/api/auth/sign-out', { data: {} })).status()).toBe(200)
    expect((await api.post('/api/auth/sign-out', { data: {} })).status()).toBe(200)
    expect(await sessionOf(api)).toBeNull()
    await api.dispose()
  })

  test('signing out on one device leaves the same user signed in on another', async ({
    browser,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const laptop = await browser.newContext({ baseURL: CLIENT_URL })
    const phone = await browser.newContext({ baseURL: CLIENT_URL })
    const laptopPage = await laptop.newPage()
    const phonePage = await phone.newPage()
    await loginThroughUi(laptopPage, agent.email, agent.password)
    await loginThroughUi(phonePage, agent.email, agent.password)

    await laptopPage.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(laptopPage)

    await phonePage.reload()
    await expect(phonePage.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await laptop.close()
    await phone.close()
  })

  // BUG (see report): after signing out, signing in again without a full page reload lands back on
  // /login, because ProtectedRoute still holds the cached "no session".
  // test.fail() keeps the suite green while the bug exists and turns red once it is fixed.
  test('signing back in right after signing out reaches the home page', async ({
    page,
    signInPage,
    adminCredentials,
  }) => {
    test.fail()
    await signInPage(page, adminCredentials.email, adminCredentials.password)
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(page)

    await fillLoginForm(page, adminCredentials.email, adminCredentials.password)
    await submitLoginForm(page)

    await expect(page.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
  })
})

test.describe('sessions are per user', () => {
  test('an admin and an agent can be signed in at the same time without mixing up', async ({
    browser,
    adminCredentials,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const adminContext = await browser.newContext({ baseURL: CLIENT_URL })
    const agentContext = await browser.newContext({ baseURL: CLIENT_URL })
    const adminPage = await adminContext.newPage()
    const agentPage = await agentContext.newPage()

    await loginThroughUi(adminPage, adminCredentials.email, adminCredentials.password)
    await loginThroughUi(agentPage, agent.email, agent.password)

    await expect(adminPage.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
    await expect(adminPage.getByRole('link', { name: 'Users' })).toBeVisible()
    await expect(agentPage.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await expect(agentPage.getByRole('link', { name: 'Users' })).toHaveCount(0)

    await agentPage.goto('/users')
    await expect(agentPage).toHaveURL('/')
    await adminPage.goto('/users')
    await expect(adminPage).toHaveURL(/\/users$/)

    expect((await sessionOf(adminContext.request))?.user.role).toBe('admin')
    expect((await sessionOf(agentContext.request))?.user.role).toBe('agent')

    await adminContext.close()
    await agentContext.close()
  })

  test('signing out the admin does not sign out the agent', async ({
    browser,
    adminCredentials,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const adminContext = await browser.newContext({ baseURL: CLIENT_URL })
    const agentContext = await browser.newContext({ baseURL: CLIENT_URL })
    const adminPage = await adminContext.newPage()
    const agentPage = await agentContext.newPage()
    await loginThroughUi(adminPage, adminCredentials.email, adminCredentials.password)
    await loginThroughUi(agentPage, agent.email, agent.password)

    await adminPage.getByRole('button', { name: 'Sign out' }).click()
    await expectOnLoginPage(adminPage)

    await agentPage.reload()
    await expect(agentPage.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await adminContext.close()
    await agentContext.close()
  })
})

test.describe('signed-in user on the login page', () => {
  // The login page does not redirect signed-in users; this documents that (see report).
  test('is shown the login form again and stays signed in', async ({ page, makeAgent }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    await page.goto('/login')

    await expectOnLoginPage(page)
    expect((await sessionOf(page.request))?.user.email).toBe(agent.email)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
  })
})

test.describe('accounts changed while signed in', () => {
  test('a user who gets banned is signed out on the next load', async ({
    page,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    const ban = await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })
    expect(ban.status()).toBe(200)
    await page.reload()

    await expectOnLoginPage(page)
    expect(await sessionOf(page.request)).toBeNull()
  })

  test('a banned user regains access after being unbanned', async ({ page, admin, makeAgent }) => {
    const agent = await makeAgent()
    await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })
    await admin.post('/api/auth/admin/unban-user', { data: { userId: agent.id } })

    await loginThroughUi(page, agent.email, agent.password)

    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
  })

  test('a user who is removed is signed out on the next load', async ({
    page,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await loginThroughUi(page, agent.email, agent.password)

    const removed = await admin.post('/api/auth/admin/remove-user', { data: { userId: agent.id } })
    expect(removed.status()).toBe(200)
    await page.reload()

    await expectOnLoginPage(page)
  })
})
