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
  await page.getByRole('button', { name: /Scan Evidence And Timeline/i }).click()
  await expect(page.getByTestId('scan-history-export')).toBeVisible()
  await page.getByRole('button', { name: /Alerts, Reports, Exports, And Audit/i }).click()
  await expect(page.getByTestId('alerts-export')).toBeVisible()
  await expect(page.getByTestId('audit-export')).toBeVisible()
  await expect(page.getByTestId('executive-csv-export')).toBeVisible()
  await expect(page.getByTestId('executive-excel-export')).toBeVisible()
})

test('dashboard navigation search narrows screens and active route is precise', async ({ page }) => {
  await page.goto('/dashboard/rightsizing')

  await expect(page.getByRole('link', { name: /^Overview$/ })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: /^Rightsizing$/ })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('searchbox', { name: 'Find dashboard screen' }).fill('kubernetes')
  await expect(page.getByRole('link', { name: /^Kubernetes$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /K8s Namespaces/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Rightsizing$/ })).toBeHidden()

  await page.getByRole('searchbox', { name: 'Find dashboard screen' }).fill('no screen here')
  await expect(page.getByText('No screens match that search.')).toBeVisible()

  await page.goto('/dashboard/k8s-namespaces')
  await expect(page).toHaveURL(/\/dashboard\/kubernetes$/)
  await expect(page.getByRole('heading', { name: 'Kubernetes Cost Allocation' })).toBeVisible()
})
