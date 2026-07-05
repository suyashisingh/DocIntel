import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { signupAndLogin, uniqueEmail } from './helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf')

/** Upload the sample PDF and wait for it to finish processing. Returns the document page URL. */
async function uploadAndWaitForCompletion(page) {
  await page.goto('/upload')
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF)
  await page.getByRole('button', { name: /^Upload 1 file$/ }).click()
  await expect(page.getByText('Processing complete')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('link', { name: 'View →' }).click()
  await expect(page).toHaveURL(/\/documents\/\d+/)
}

test.describe('Search and Filters', () => {
  test.setTimeout(120_000)

  test('searching a keyword returns results', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('searchhit') })
    await uploadAndWaitForCompletion(page)

    await page.goto('/search')
    await page.getByPlaceholder('Search documents, tables, entities…').fill('Invoice')
    await page.getByRole('button', { name: /^Search$/ }).click()

    await expect(page.getByText(/^\d+ results?$/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('sample.pdf')).toBeVisible()
  })

  test('searching a keyword with no matches shows No results found', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('searchmiss') })
    await uploadAndWaitForCompletion(page)

    await page.goto('/search')
    await page.getByPlaceholder('Search documents, tables, entities…').fill('zzzznonexistentkeyword123')
    await page.getByRole('button', { name: /^Search$/ }).click()

    await expect(page.getByText('No results found')).toBeVisible({ timeout: 15_000 })
  })

  test('tag filter chips can be toggled and filter results', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('searchtag') })
    await uploadAndWaitForCompletion(page)

    const tagName = `e2e-tag-${Date.now()}`

    // Apply a fresh tag to the document via the "Manage tags" selector.
    await page.getByRole('button', { name: 'Manage tags' }).click()
    await page.getByRole('button', { name: 'New tag' }).click()
    await page.getByPlaceholder('Tag name').fill(tagName)
    await page.getByRole('button', { name: /^Create$/ }).click()
    await expect(page.getByText(tagName).first()).toBeVisible({ timeout: 10_000 })

    await page.goto('/search')
    await page.getByPlaceholder('Search documents, tables, entities…').fill('Invoice')
    await page.getByRole('button', { name: /^Search$/ }).click()
    await expect(page.getByText(/^\d+ results?$/)).toBeVisible({ timeout: 15_000 })

    // Toggle the tag chip on — the "Active filters" row should appear.
    await page.getByRole('button', { name: tagName }).click()
    await expect(page.getByText('Active filters:')).toBeVisible()

    // Re-run the search with the tag filter applied — the tagged document still matches.
    await page.getByRole('button', { name: /^Search$/ }).click()
    await expect(page.getByText(/^\d+ results?$/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('sample.pdf')).toBeVisible()
  })
})
