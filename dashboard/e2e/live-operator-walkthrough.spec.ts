import { expect, test } from '@playwright/test'

// Live OCI walkthrough: this config intentionally has no webServer block.
// The app runtime must already be deployed on the OCI VM.

const dashboardScreens = [
  { route: '/dashboard', heading: 'OptiOra Command Center' },
  { route: '/dashboard/my-dashboards', heading: 'Saved Views' },
  { route: '/dashboard/costs', heading: 'Billing & Allocation' },
  { route: '/dashboard/accounts', heading: 'Account Hierarchy' },
  { route: '/dashboard/portfolio', heading: 'Customer Portfolio' },
  { route: '/dashboard/ai-insights', heading: 'AI Cost Intelligence' },
  { route: '/dashboard/cost-advisor', heading: 'Cost Advisor' },
  { route: '/dashboard/forecasting', heading: 'Predictive Cost Analytics' },
  { route: '/dashboard/unit-economics', heading: 'Unit Economics Cockpit' },
  { route: '/dashboard/scorecards', heading: 'FinOps Scorecards' },
  { route: '/dashboard/advanced-finops', heading: 'FinOps Control Tower' },
  { route: '/dashboard/inventory', heading: 'Inventory Explorer' },
  { route: '/dashboard/kubernetes', heading: 'Kubernetes Cost Allocation' },
  { route: '/dashboard/virtual-tags', heading: 'Virtual Tags' },
  { route: '/dashboard/rightsizing', heading: 'Optimization Advisor' },
  { route: '/dashboard/operations', heading: 'Operations' },
  { route: '/dashboard/admin', heading: 'Admin Diagnostics' },
  { route: '/dashboard/anomalies', heading: 'Cost Anomalies' },
  { route: '/dashboard/recommendations', heading: 'Action Ledger' },
  { route: '/dashboard/settings', heading: 'Cloud Settings' },
]

const consoleRoutes = new Set([
  '/dashboard/inventory',
  '/dashboard/kubernetes',
  '/dashboard/rightsizing',
  '/dashboard/recommendations',
])

test.describe.configure({ mode: 'serial' })

test('human operator walks every live OCI dashboard capability without broken UI states', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  let currentRoute = 'not-started'

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(`${currentRoute}: ${error.message}`)
  })

  for (const screen of dashboardScreens) {
    currentRoute = screen.route
    await page.goto(screen.route, { waitUntil: 'domcontentloaded' })
    const main = page.locator('#dashboard-main')
    await expect(main.getByRole('heading', { name: screen.heading })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/Application error|Unhandled Runtime Error|404: This page could not be found/i)).toHaveCount(0)

    const activeLinks = page.locator('nav[aria-label="Dashboard navigation"] a[aria-current="page"]')
    await expect(activeLinks).toHaveCount(1)
    await expect(activeLinks.first()).toHaveAttribute('href', screen.route)

    const explainButton = page.getByRole('button', { name: /Explain page/i })
    if ((await explainButton.count()) > 0) {
      await explainButton.first().click()
      await expect(page.getByText('What this page means')).toBeVisible()
      await explainButton.first().click()
    }

    const expanders = main.locator('section button[aria-expanded]')
    await expect(
      expanders.first(),
      `${screen.route} should expose operator detail behind expanders after live data finishes loading`,
    ).toBeVisible({ timeout: 60_000 })
    const firstExpander = expanders.first()
    const openBefore = await firstExpander.getAttribute('aria-expanded')
    await firstExpander.click()
    await expect(firstExpander).toHaveAttribute('aria-expanded', openBefore === 'true' ? 'false' : 'true')
    await firstExpander.click()
    await expect(firstExpander).toHaveAttribute('aria-expanded', openBefore || 'false')

    if (consoleRoutes.has(screen.route)) {
      const consoleLinks = page.getByRole('link', { name: /Open .*console|Open console|Open OCI console|Open in cloud console/i })
      const linkCount = await consoleLinks.count()
      for (let index = 0; index < Math.min(linkCount, 3); index += 1) {
        const href = await consoleLinks.nth(index).getAttribute('href')
        expect(href, `${screen.route} console link ${index} should be concrete`).toBeTruthy()
        expect(href).not.toContain('...')
        expect(href).not.toMatch(/undefined|null/i)
      }
    }

    expect(pageErrors).toEqual([])
  }

  await page.getByRole('searchbox', { name: 'Find dashboard screen' }).fill('kubernetes')
  await expect(page.getByRole('link', { name: /^Kubernetes$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /K8s Namespaces/i })).toHaveCount(0)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('live Advisor Conversation remains wired, English, and provider-grounded', async ({ request }) => {
  const response = await request.post('/api/ai/chat', {
    data: {
      message: 'Which cloud resources are over-provisioned?',
      conversationHistory: [{ role: 'user', content: 'Bitte antworte auf Deutsch' }],
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.success).toBe(true)
  expect(String(body.response)).toContain('Here')
  expect(String(body.response)).toMatch(/resource|rightsizing|provider/i)
  expect(String(body.response)).not.toMatch(/\b(Deutsch|Bitte|Antwort|Ressource)\b/)
})
