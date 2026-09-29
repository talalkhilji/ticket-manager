import { test, expect } from '../support/fixtures'
import { createUser, newApi, sessionOf, strongPassword, uniqueEmail } from '../support/api'
import { fillLoginForm, submitLoginForm } from '../support/ui'

const genericError = 'Invalid email or password'

test.describe('login form', () => {
  test('shows an accessible form with a masked password field', async ({ page }) => {
    await page.goto('/login')

    // The card title is not a heading element (see report), so match it by text.
    await expect(page.getByText('Enter your email and password to continue.')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    // There is no show/hide password toggle in the app today.
    await expect(page.getByRole('button', { name: /show|hide|reveal/i })).toHaveCount(0)
  })

  test('the admin can sign in and lands on the home page', async ({ page, adminCredentials }) => {
    await page.goto('/login')
    await fillLoginForm(page, adminCredentials.email, adminCredentials.password)
    await submitLoginForm(page)

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  })

  test('an agent can sign in and sees their own name', async ({ page, makeAgent }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await submitLoginForm(page)

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
  })

  test('pressing Enter in the password field submits the form', async ({ page, makeAgent }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await page.getByLabel('Password').press('Enter')

    await expect(page).toHaveURL('/')
  })

  test('a wrong password shows a generic error and does not sign in', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, 'not-the-right-password')
    await submitLoginForm(page)

    await expect(page.getByText(genericError)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessionOf(page.request)).toBeNull()
  })

  test('an unknown email shows the same error as a wrong password (no user enumeration)', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, 'not-the-right-password')
    await submitLoginForm(page)
    await expect(page.getByText(genericError)).toBeVisible()
    const wrongPasswordMessage = await page.getByText(genericError).textContent()

    await page.reload()
    await fillLoginForm(page, uniqueEmail('nobody'), 'not-the-right-password')
    await submitLoginForm(page)
    await expect(page.getByText(genericError)).toBeVisible()
    const unknownEmailMessage = await page.getByText(genericError).textContent()

    expect(unknownEmailMessage).toBe(wrongPasswordMessage)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('the API answers wrong password and unknown email identically', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)

    const wrongPassword = await api.post('/api/auth/sign-in/email', {
      data: { email: agent.email, password: 'not-the-right-password' },
    })
    const unknownEmail = await api.post('/api/auth/sign-in/email', {
      data: { email: uniqueEmail('nobody'), password: 'not-the-right-password' },
    })

    expect(wrongPassword.status()).toBe(401)
    expect(unknownEmail.status()).toBe(wrongPassword.status())
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json())
    await api.dispose()
  })

  test('empty fields show validation messages and send no request', async ({ page }) => {
    const signInRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/sign-in')) signInRequests.push(req.url())
    })

    await page.goto('/login')
    await submitLoginForm(page)

    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(signInRequests).toEqual([])
  })

  test('an invalid email format is rejected before any request', async ({ page }) => {
    const signInRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/sign-in')) signInRequests.push(req.url())
    })

    await page.goto('/login')
    await fillLoginForm(page, 'not-an-email', 'whatever-password')
    await submitLoginForm(page)

    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Password is required')).toHaveCount(0)
    expect(signInRequests).toEqual([])
  })

  test('a missing password alone is reported', async ({ page, makeAgent }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await page.getByLabel('Email').fill(agent.email)
    await submitLoginForm(page)

    await expect(page.getByText('Password is required')).toBeVisible()
    await expect(page.getByText('Enter a valid email address')).toHaveCount(0)
  })

  test('the email is matched case-insensitively', async ({ page, makeAgent }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email.toUpperCase(), agent.password)
    await submitLoginForm(page)

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: `Welcome, ${agent.name}` })).toBeVisible()
  })

  test('spaces around the email are stripped by the field and sign-in succeeds', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, `  ${agent.email}  `, agent.password)
    await expect(page.getByLabel('Email')).toHaveValue(agent.email)
    await submitLoginForm(page)

    await expect(page).toHaveURL('/')
  })

  test('the API rejects an email with surrounding spaces instead of guessing', async ({
    playwright,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const api = await newApi(playwright)

    const res = await api.post('/api/auth/sign-in/email', {
      data: { email: ` ${agent.email} `, password: agent.password },
    })

    expect(res.status()).toBe(400)
    expect(await sessionOf(api)).toBeNull()
    await api.dispose()
  })

  test('the password is not trimmed', async ({ page, admin }) => {
    const password = `${strongPassword()} `
    const user = await createUser(admin, { password })

    try {
      await page.goto('/login')
      await fillLoginForm(page, user.email, password.trim())
      await submitLoginForm(page)
      await expect(page.getByText(genericError)).toBeVisible()

      await fillLoginForm(page, user.email, password)
      await submitLoginForm(page)
      await expect(page).toHaveURL('/')
    } finally {
      await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
    }
  })

  test('the submit button is disabled and relabelled while signing in, and only one request is sent', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let requests = 0
    await page.route('**/api/auth/sign-in/email', async (route) => {
      requests += 1
      await held
      await route.continue()
    })

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await submitLoginForm(page)

    const pending = page.getByRole('button', { name: 'Signing in...' })
    await expect(pending).toBeDisabled()
    // A submit while the button is disabled must not send another request.
    await page.getByLabel('Password').press('Enter')

    release()
    await expect(page).toHaveURL('/')
    expect(requests).toBe(1)
  })

  test('the error is cleared when the user tries again', async ({ page, makeAgent }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, 'not-the-right-password')
    await submitLoginForm(page)
    await expect(page.getByText(genericError)).toBeVisible()

    // Hold the retry so the pending state is observable.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await held
      await route.continue()
    })
    await page.getByLabel('Password').fill(agent.password)
    await submitLoginForm(page)

    await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
    await expect(page.getByText(genericError)).toHaveCount(0)

    release()
    await expect(page).toHaveURL('/')
  })

  test('a failed retry shows the error again and re-enables the button', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, 'wrong-one-aaaa')
    await submitLoginForm(page)
    await expect(page.getByText(genericError)).toBeVisible()

    await page.getByLabel('Password').fill('wrong-two-bbbb')
    await submitLoginForm(page)
    await expect(page.getByText(genericError)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  test('a banned user is told they are banned and cannot sign in', async ({
    page,
    admin,
    makeAgent,
  }) => {
    const agent = await makeAgent()
    const ban = await admin.post('/api/auth/admin/ban-user', { data: { userId: agent.id } })
    expect(ban.status()).toBe(200)

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await submitLoginForm(page)

    await expect(page.getByText(/You have been banned from this application/)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessionOf(page.request)).toBeNull()
  })

  test('a removed user cannot sign in', async ({ page, admin, makeAgent }) => {
    const agent = await makeAgent()
    const removed = await admin.post('/api/auth/admin/remove-user', { data: { userId: agent.id } })
    expect(removed.status()).toBe(200)

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await submitLoginForm(page)

    await expect(page.getByText(genericError)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  // BUG (see report): after an unauthenticated visit to a protected URL, a successful sign-in is
  // bounced straight back to /login because ProtectedRoute still holds the cached "no session".
  // test.fail() keeps the suite green while the bug exists and turns red once it is fixed.
  test('signing in after being redirected from a protected page lands on the home page', async ({
    page,
    adminCredentials,
  }) => {
    test.fail()
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    await fillLoginForm(page, adminCredentials.email, adminCredentials.password)
    await submitLoginForm(page)

    await expect(page.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
  })

  test('the app does not remember the requested page: sign-in from a fresh login page goes to home', async ({
    page,
    adminCredentials,
  }) => {
    // A deep link such as /users is not preserved across the login redirect (see report).
    await page.goto('/login?next=/users')

    await fillLoginForm(page, adminCredentials.email, adminCredentials.password)
    await submitLoginForm(page)

    await expect(page).toHaveURL('/')
  })

  test('signing in replaces the login page in history, so Back does not return to the form', async ({
    page,
    makeAgent,
  }) => {
    const agent = await makeAgent()

    await page.goto('/login')
    await fillLoginForm(page, agent.email, agent.password)
    await submitLoginForm(page)
    await expect(page).toHaveURL('/')

    await page.goBack()
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })
})
