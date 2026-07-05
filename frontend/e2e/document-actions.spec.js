import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { signupAndLogin, uniqueEmail } from './helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf')
const SAMPLE_PDF_BUFFER = fs.readFileSync(SAMPLE_PDF)

test.describe('Document Actions', () => {
  test('user can select multiple documents and see bulk action bar appear', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('bulkselect') })

    // Upload two files in one go — checkbox selection doesn't require processing
    // to finish, so we don't wait for "Completed" here.
    await page.goto('/upload')
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'bulk-1.pdf', mimeType: 'application/pdf', buffer: SAMPLE_PDF_BUFFER },
      { name: 'bulk-2.pdf', mimeType: 'application/pdf', buffer: SAMPLE_PDF_BUFFER },
    ])
    await expect(page.getByText('2 files selected')).toBeVisible()
    await page.getByRole('button', { name: /^Upload 2 files$/ }).click()

    await page.goto('/dashboard')
    await expect(page.getByText('bulk-1.pdf')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('bulk-2.pdf')).toBeVisible()

    // Select all via the header checkbox — selects both uploaded documents at once.
    await page.locator('tr.doc-header-row input.doc-checkbox').check({ force: true })

    await expect(page.getByText('2 documents selected')).toBeVisible({ timeout: 10_000 })
  })

  test('user can create a folder and see it in the sidebar', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('folder') })
    await page.goto('/dashboard')

    const folderName = `E2E Folder ${Date.now()}`
    await page.getByRole('button', { name: 'New folder' }).click()
    await page.getByPlaceholder('Folder name').fill(folderName)
    await page.getByRole('button', { name: /^Create$/ }).click()

    await expect(page.getByText(folderName)).toBeVisible({ timeout: 10_000 })
  })

  test('user can add a tag to a document and see it displayed', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('addtag') })

    await page.goto('/upload')
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF)
    await page.getByRole('button', { name: /^Upload 1 file$/ }).click()
    await expect(page.getByText('Processing complete')).toBeVisible({ timeout: 90_000 })
    await page.getByRole('link', { name: 'View →' }).click()
    await expect(page).toHaveURL(/\/documents\/\d+/)

    const tagName = `e2e-doc-tag-${Date.now()}`
    await expect(page.getByText('No tags applied.')).toBeVisible()

    await page.getByRole('button', { name: 'Manage tags' }).click()
    await page.getByRole('button', { name: 'New tag' }).click()
    await page.getByPlaceholder('Tag name').fill(tagName)
    await page.getByRole('button', { name: /^Create$/ }).click()

    // The applied tag renders as a removable badge in the Tags card — its
    // "Remove {name}" control is unique, unlike the plain tag name text which
    // also appears inside the still-open "Manage tags" dropdown list.
    await expect(page.getByText('No tags applied.')).not.toBeVisible()
    await expect(page.getByRole('button', { name: `Remove ${tagName}` })).toBeVisible({ timeout: 10_000 })
  })
})
