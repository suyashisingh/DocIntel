import { execSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { signupAndLogin, uniqueEmail } from './helpers'

/**
 * Invites in this app are asynchronous and email-based (PendingInvite + a
 * signup link with a JWT token) — there is no way to obtain a second,
 * already-a-member non-admin user through pure browser automation without a
 * real inbox. Since the JWT only encodes user_id (role is always looked up
 * fresh from organization_users on every request), we can reuse the same
 * signed-in account and demote its own membership row directly in the dev
 * database, then reload — the UI will reflect the new role exactly as it
 * would for a real non-admin member.
 */
function demoteToViewer(email) {
  const sql = `UPDATE organization_users SET role='viewer' WHERE user_id = (SELECT id FROM users WHERE email = '${email}')`
  execSync(`docker exec ai-doc-intelligence-db-1 psql -U postgres -d docintel -c "${sql}"`, { stdio: 'pipe' })
}

test.describe('Team and Roles', () => {
  test('admin can create a custom role with specific permissions', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('rolescreate') })
    await page.goto('/roles')

    const roleName = `hr-${Date.now()}`
    await page.getByRole('button', { name: 'New role' }).click()
    await page.getByPlaceholder('Role name').fill(roleName)
    await page.getByPlaceholder('Description (optional)').fill('Human Resources access')
    await page.getByRole('button', { name: /^Create role$/ }).click()

    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10_000 })

    // Grant a specific, non-ambiguous permission (not duplicated in the
    // collapsed card summary) and save.
    const card = page.locator('.grid.grid-cols-1 > div', { hasText: roleName })
    await card.getByRole('button', { name: 'Edit' }).click()

    await expect(page.getByRole('heading', { name: `Edit ${roleName}` })).toBeVisible()
    const chatRow = page.getByText('Use AI chat', { exact: true }).locator('xpath=..')
    await chatRow.locator('[role="switch"]').click()
    await page.getByRole('button', { name: /^Save changes$/ }).click()

    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 10_000 })
  })

  test('admin can view team members list', async ({ page }) => {
    const { email } = await signupAndLogin(page, { email: uniqueEmail('teamview') })
    await page.goto('/team')

    await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByText('(you)')).toBeVisible()
  })

  test('non-admin user does not see Roles/Audit Log in sidebar', async ({ page }) => {
    const { email } = await signupAndLogin(page, { email: uniqueEmail('nonadmin') })

    // Confirm they're visible for the admin first.
    await expect(page.getByRole('link', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Audit Log' })).toBeVisible()

    demoteToViewer(email)
    await page.reload()

    await expect(page.getByRole('link', { name: 'Roles' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Audit Log' })).not.toBeVisible()
    // Sanity check the rest of the nav still renders normally.
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  })
})
