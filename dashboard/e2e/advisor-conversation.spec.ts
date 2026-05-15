import path from 'node:path'
import { expect, test } from '@playwright/test'

const fixtureCsv = path.join(__dirname, 'fixtures', 'import-costs.csv')

test('advanced FinOps Advisor Conversation explains a control tower action from live telemetry', async ({ page }) => {
  await page.goto('/dashboard/settings')
  await expect(page.getByRole('heading', { name: 'Cloud Settings' })).toBeVisible()
  await page.getByTestId('csv-upload-input').setInputFiles(fixtureCsv)
  await page.getByTestId('csv-upload-submit').click()
  await expect(page.getByTestId('csv-upload-message')).toContainText('optional manual billing source')

  await page.goto('/dashboard/advanced-finops')
  const main = page.locator('#dashboard-main')
  await expect(main.getByRole('heading', { name: 'FinOps Control Tower' })).toBeVisible()

  await main.getByRole('button', { name: /Expand commitments only on measured steady-state demand|Execute low-effort waste quick wins first|Keep monthly forecast backtesting active/ }).first().click()

  await expect(main.getByText('Asking advisor...')).toHaveCount(0, { timeout: 60_000 })

  await expect(main.getByText('I checked the live Control Tower telemetry.')).toBeVisible()
  await expect(main.getByText(/Owner:/)).toBeVisible()
  await expect(main.getByText(/Evidence:/)).toBeVisible()
  await expect(main.getByText(/Next steps:/)).toBeVisible()
  await expect(main.getByText(/I'd like to know more|I would like to know more/i)).toHaveCount(0)
})

test('advanced FinOps Advisor Conversation keeps numbered action follow-ups in control tower context', async ({ page }) => {
  await page.goto('/dashboard/settings')
  await expect(page.getByRole('heading', { name: 'Cloud Settings' })).toBeVisible()
  await page.getByTestId('csv-upload-input').setInputFiles(fixtureCsv)
  await page.getByTestId('csv-upload-submit').click()
  await expect(page.getByTestId('csv-upload-message')).toContainText('optional manual billing source')

  await page.goto('/dashboard/advanced-finops')
  const main = page.locator('#dashboard-main')
  await expect(main.getByRole('heading', { name: 'FinOps Control Tower' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Ask the Advisor Conversation' }).fill([
    '1. Review the top 10 most expensive resources to identify potential rightsizing or reservation opportunities.',
    '2. Analyze the estimated waste by resource type to identify areas with the greatest potential for optimization.',
  ].join('\n'))
  await main.getByRole('button', { name: /^Send$/ }).click()

  await expect(main.getByText('Asking advisor...')).toHaveCount(0, { timeout: 60_000 })
  await expect(main.getByText('I checked the live Control Tower telemetry.')).toBeVisible()
  await expect(main.getByText(/Owner:/)).toBeVisible()
  await expect(main.getByText(/Risk\/guardrail:/)).toBeVisible()
  await expect(main.getByText(/live rightsizing feed/i)).toHaveCount(0)
})
