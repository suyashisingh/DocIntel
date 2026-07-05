import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { signupAndLogin, uniqueEmail } from './helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf')

test.describe('Upload and Chat', () => {
  // Each test needs its own org/user + a freshly processed document, and
  // document processing (OCR, NLP, embeddings) genuinely takes time — allow
  // a generous budget for the whole test.
  test.setTimeout(120_000)

  test('user can upload a PDF and wait for it to show Completed status', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('upload') })

    await page.goto('/upload')
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF)
    // A single selected file is shown by its own filename, not "1 file selected"
    // (that text only appears once 2+ files are selected). It renders both in
    // the dropzone preview and in the file list below, so scope to the first.
    await expect(page.getByText('sample.pdf').first()).toBeVisible()

    await page.getByRole('button', { name: /^Upload 1 file$/ }).click()

    // Processing tracker shows the doc name, then flips to "Processing complete"
    // once the Celery pipeline finishes (OCR + NLP + classification + embeddings).
    await expect(page.getByText('Processing complete')).toBeVisible({ timeout: 90_000 })
  })

  test('user can open a completed document and see extracted entities', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('entities') })

    await page.goto('/upload')
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF)
    await page.getByRole('button', { name: /^Upload 1 file$/ }).click()
    await expect(page.getByText('Processing complete')).toBeVisible({ timeout: 90_000 })

    await page.getByRole('link', { name: 'View →' }).click()
    await expect(page).toHaveURL(/\/documents\/\d+/)

    // The fixture PDF mentions two people (John Smith, Jane Doe) so the People
    // entity group should render (the page hides groups with < 2 values).
    await expect(page.getByText('Extracted entities')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('People')).toBeVisible()
    // exact: true avoids matching the AI summary paragraph, which also
    // mentions "John Smith" as a substring within a longer sentence.
    await expect(page.getByText('John Smith', { exact: true })).toBeVisible()
  })

  test('user can ask a question in Chat and receive an answer with a confidence bar', async ({ page }) => {
    await signupAndLogin(page, { email: uniqueEmail('chat') })

    await page.goto('/upload')
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF)
    await page.getByRole('button', { name: /^Upload 1 file$/ }).click()
    await expect(page.getByText('Processing complete')).toBeVisible({ timeout: 90_000 })

    await page.goto('/chat')
    await expect(page.getByPlaceholder('Ask a question about your documents…')).toBeVisible()
    // Default scope is "All documents" (selectedDocId = null), which already
    // covers the just-uploaded file — no need to select it explicitly.

    await page.getByPlaceholder('Ask a question about your documents…').fill('Who is the vendor on this invoice?')
    await page.locator('button[title="Send"]').click()

    // Confidence bar is only rendered once confidence_level is present in the response.
    await expect(page.locator('.bg-emerald-500, .bg-amber-400, .bg-red-500').first()).toBeVisible({ timeout: 30_000 })
  })
})
