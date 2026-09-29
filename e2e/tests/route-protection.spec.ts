import { test, expect } from '../support/fixtures'
import { expectOnLoginPage } from '../support/ui'

test.describe('unauthenticated visitor', () => {
  test('is redirected from the home page to the login page', async ({ page }) => {
    await page.goto('/')

    await expectOnLoginPage(page)
    await expect(page.getByRole('heading', { name: /Welcome/ })).toHaveCount(0)
  })

  test('is redirected from the users page to the login page', async ({ page }) => {
    await page.goto('/users')

    await expectOnLoginPage(page)
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })

  test('is redirected from the users page with a trailing slash or query string', async ({
    page,
  }) => {
    await page.goto('/users/')
    await expectOnLoginPage(page)

    await page.goto('/users?tab=all')
    await expectOnLoginPage(page)
  })

  test('sees no navigation bar on the login page', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
  })

  test('the Back button after a redirect does not expose a protected page', async ({ page }) => {
    await page.goto('/login')
    await page.goto('/users')
    await expectOnLoginPage(page)

    await page.goBack()

    await expectOnLoginPage(page)
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })
})

test.describe('agent', () => {
  test('is redirected away from the users page to the home page', async ({
    page,
    signInPage,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await signInPage(page, agent.email, agent.password)

    await page.goto('/users')

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
  })

  test('is redirected away from the users page with a trailing slash', async ({
    page,
    signInPage,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await signInPage(page, agent.email, agent.password)

    await page.goto('/users/')

    await expect(page).toHaveURL('/')
  })

  test('does not see the Users link in the navigation', async ({ page, signInPage, makeAgent }) => {
    const agent = await makeAgent()
    await signInPage(page, agent.email, agent.password)

    await page.goto('/')

    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByText(agent.name, { exact: true }).first()).toBeVisible()
  })

  test('is not given admin rights by the role shown in the browser session', async ({
    page,
    signInPage,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    await signInPage(page, agent.email, agent.password)
    await page.goto('/')

    const session = await page.request.get('/api/auth/get-session')
    const body = (await session.json()) as { user: { role: string } }

    expect(body.user.role).toBe('agent')
  })
})

test.describe('admin', () => {
  test('can open the users page', async ({ page, signInPage, adminCredentials }) => {
    await signInPage(page, adminCredentials.email, adminCredentials.password)

    await page.goto('/users')

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test('sees the Users link in the navigation and can follow it', async ({
    page,
    signInPage,
    adminCredentials,
  }) => {
    await signInPage(page, adminCredentials.email, adminCredentials.password)
    await page.goto('/')

    await page.getByRole('link', { name: 'Users' }).click()

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByText('Admin', { exact: true })).toBeVisible()
  })

  test('the users page keeps the admin on the users page after a reload', async ({
    page,
    signInPage,
    adminCredentials,
  }) => {
    await signInPage(page, adminCredentials.email, adminCredentials.password)
    await page.goto('/users')

    await page.reload()

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })
})
