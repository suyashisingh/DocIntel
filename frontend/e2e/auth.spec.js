import { test, expect } from '@playwright/test'
import { login, signup, signupAndLogin, uniqueEmail, TEST_PASSWORD } from './helpers'

test.describe('Authentication', () => {
  test('user can sign up with a new org and lands on dashboard', async ({ page }) => {
    const email = uniqueEmail('signup')
    await signup(page, { email, password: TEST_PASSWORD, orgName: `Signup Org ${Date.now()}` })

    // Signup does not auto-authenticate — it redirects to /login on success.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    await login(page, email, TEST_PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('user can log out and log back in successfully', async ({ page }) => {
    const { email, password } = await signupAndLogin(page, { email: uniqueEmail('logout') })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    await login(page, email, password)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('wrong password shows an error message', async ({ page }) => {
    const email = uniqueEmail('wrongpass')
    await signup(page, { email, password: TEST_PASSWORD, orgName: `Wrongpass Org ${Date.now()}` })
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    await login(page, email, 'TotallyWrongPassword1!')

    // Backend returns detail "Invalid credentials"; the Login page falls back
    // to "Login failed. Please try again." only when no response detail is present.
    await expect(page.getByText(/Invalid credentials|Login failed/i)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })
})
