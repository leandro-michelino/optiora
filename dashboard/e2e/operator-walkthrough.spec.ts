import path from 'node:path'
import { expect, test } from '@playwright/test'

// Leandro Michelino - ACE : leandro.michelino@oracle.com - get in touch to more details or features or if you are interested to run a Pilot

const fixtureCsv = path.join(__dirname, 'fixtures', 'import-costs.csv')

const dashboardScreens = [
  { route: '/dashboard', heading: 'OptiOra Command Center' },
  { route: '/dashboard/my-dashboards', heading: 'My Dashboards' },
  { route: '/dashboard/costs', heading: 'Cost Breakdown & Analysis' },
  { route: '/dashboard/accounts', heading: 'Account Hierarchy' },
  { route: '/dashboard/portfolio', heading: 'Customer Portfolio' },
  { route: '/dashboard/ai-insights', heading: 'AI Cost Intelligence' },
  { route: '/dashboard/cost-advisor', heading: 'Cost Advisor' },
  { route: '/dashboard/forecasting', heading: 'Predictive Cost Analytics' },
  { route: '/dashboard/unit-economics', heading: 'Unit Economics Cockpit' },
  { route: '/dashboard/scorecards', heading: 'FinOps Scorecards' },
  { route: '/dashboard/advanced-finops', heading: 'Advanced FinOps Console' },
  { route: '/dashboard/inventory', heading: 'Cloud Resource Inventory' },
  { route: '/dashboard/kubernetes', heading: 'Kubernetes Cost Allocation' },
  { route: '/dashboard/virtual-tags', heading: 'Virtual Tags' },
  { route: '/dashboard/rightsizing', heading: 'Rightsizing' },
  { route: '/dashboard/operations', heading: 'Operations' },
  { route: '/dashboard/admin', heading: 'Admin Diagnostics' },
  { route: '/dashboard/anomalies', heading: 'Cost Anomalies' },
  { route: '/dashboard/recommendations', heading: 'Optimization Recommendations' },
  { route: '/dashboard/settings', heading: 'Cloud Settings' },
]

test('operator walkthrough loads every dashboard capability without broken UI states', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.goto('/dashboard/settings')
  await expect(page.getByRole('heading', { name: 'Cloud Settings' })).toBeVisible()
  await page.getByTestId('csv-upload-input').setInputFiles(fixtureCsv)
  await page.getByTestId('csv-upload-submit').click()
  await expect(page.getByTestId('csv-upload-message')).toContainText('optional manual billing source')

  for (const screen of dashboardScreens) {
    await page.goto(screen.route)
    await expect(page.locator('#dashboard-main').getByRole('heading', { name: screen.heading })).toBeVisible()
    await expect(page.getByText(/Application error|Unhandled Runtime Error|404: This page could not be found/i)).toHaveCount(0)

    const activeLinks = page.locator('nav[aria-label="Dashboard navigation"] a[aria-current="page"]')
    await expect(activeLinks).toHaveCount(1)
    await expect(activeLinks.first()).toHaveAttribute('href', screen.route)
  }

  await page.getByRole('searchbox', { name: 'Find dashboard screen' }).fill('kubernetes')
  await expect(page.getByRole('link', { name: /^Kubernetes$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /K8s Namespaces/i })).toHaveCount(0)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
