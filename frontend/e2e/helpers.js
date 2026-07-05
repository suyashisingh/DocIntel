import { expect } from '@playwright/test'

export const TEST_PASSWORD = 'TestPass123!'

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
}

export async function signup(page, { email, password = TEST_PASSWORD, orgName }) {
  await page.goto('/signup')
  await page.getByPlaceholder('you@company.com').fill(email)
  if (orgName) {
    await page.getByPlaceholder('Acme Corp').fill(orgName)
  }
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /^Create account$/ }).click()
}

export async function login(page, email, password = TEST_PASSWORD) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /^Sign in$/ }).click()
}

/** Sign up a brand-new org + admin user, then log in. Returns the credentials used. */
export async function signupAndLogin(page, { email = uniqueEmail(), password = TEST_PASSWORD, orgName } = {}) {
  const org = orgName ?? `Test Org ${Date.now()}`
  await signup(page, { email, password, orgName: org })
  // Signup does not auto-authenticate — the app redirects to /login afterwards.
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  await login(page, email, password)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  return { email, password, orgName: org }
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
}
