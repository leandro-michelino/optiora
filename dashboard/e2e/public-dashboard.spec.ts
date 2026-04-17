import path from 'node:path'
import { expect, test } from '@playwright/test'

const fixtureCsv = path.join(__dirname, 'fixtures', 'import-costs.csv')

test('public dashboard uses imported CSV as a fallback source and keeps exports available', async ({ page }) => {
  await page.goto('/dashboard/settings')
  await expect(page.getByRole('heading', { name: 'Cloud Settings' })).toBeVisible()
  await expect(page.getByTestId('csv-template-download')).toBeVisible()

  await page.getByTestId('csv-upload-input').setInputFiles(fixtureCsv)
  await page.getByTestId('csv-upload-submit').click()

  await expect(page.getByTestId('csv-upload-message')).toContainText('optional manual billing source')
  await expect(page.getByTestId('imported-cost-summary')).toContainText('import-costs.csv')
  await expect(page.getByTestId('imported-cost-summary')).toContainText('410.75')

  for (const route of [
    '/dashboard',
    '/dashboard/costs',
    '/dashboard/forecasting',
    '/dashboard/ai-insights',
    '/dashboard/recommendations',
  ]) {
    await page.goto(route)
    await expect(page.getByTestId('data-source-banner')).toHaveAttribute('data-state', 'imported')
  }

  await page.goto('/dashboard/operations')
  await expect(page.getByTestId('data-source-banner')).toHaveAttribute('data-state', 'partial')
  await expect(page.getByTestId('scan-history-export')).toBeVisible()
  await expect(page.getByTestId('alerts-export')).toBeVisible()
  await expect(page.getByTestId('audit-export')).toBeVisible()
  await expect(page.getByTestId('executive-csv-export')).toBeVisible()
  await expect(page.getByTestId('executive-excel-export')).toBeVisible()
})
