import { test as base, type APIRequestContext, type Page } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_URL } from './env'
import { createUser, newApi, signIn, signInAsAdmin, type TestUser } from './api'

type Fixtures = {
  /** API client signed in as the seeded admin. */
  admin: APIRequestContext
  /** Creates a uniquely named agent through the admin API. Created users are removed after the test. */
  makeAgent: () => Promise<TestUser>
  /** Signs the page's browser context in through the API (no UI), so tests skip the login form. */
  signInPage: (page: Page, email: string, password: string) => Promise<void>
  adminCredentials: { email: string; password: string }
}

// Sessions are created per test on purpose: a shared storageState would break as soon as one test
// (logout, ban, remove) revokes that session on the server.
export const test = base.extend<Fixtures>({
  admin: async ({ playwright }, use) => {
    const admin = await signInAsAdmin(playwright)
    await use(admin)
    await admin.dispose()
  },
  makeAgent: async ({ admin }, use) => {
    const created: TestUser[] = []
    await use(async () => {
      const user = await createUser(admin)
      created.push(user)
      return user
    })
    for (const user of created) {
      // Tests may already have removed the user; ignore that.
      await admin.post('/api/auth/admin/remove-user', { data: { userId: user.id } })
    }
  },
  signInPage: async ({ playwright }, use) => {
    await use(async (page, email, password) => {
      const api = await newApi(playwright, CLIENT_URL)
      const res = await signIn(api, email, password)
      if (res.status() !== 200) throw new Error(`Sign-in failed with ${res.status()}`)
      // Cookies for localhost are shared across ports, so copy them into the browser context.
      const { cookies } = await api.storageState()
      await page.context().addCookies(cookies)
      await api.dispose()
    })
  },
  adminCredentials: async ({}, use) => {
    await use({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  },
})

export { expect } from '@playwright/test'
