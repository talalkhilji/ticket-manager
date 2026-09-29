import { expect, type Page } from '@playwright/test'

export async function fillLoginForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

export async function submitLoginForm(page: Page) {
  await page.getByRole('button', { name: /^Sign(ing)? in/ }).click()
}

/** Signs in through the login form and waits for the home page. */
export async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login')
  await fillLoginForm(page, email, password)
  await submitLoginForm(page)
  await expect(page).toHaveURL('/')
}

export async function expectOnLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toBeVisible()
}
