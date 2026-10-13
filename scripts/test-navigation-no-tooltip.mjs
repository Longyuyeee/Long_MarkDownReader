import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = 'docs/evidence/v110-navigation-no-tooltip'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.locator('.task-row').first().waitFor()
  await page.evaluate(async () => {
    if (!document.getElementById('longedit-app-tooltip')) {
      const policy = await import('/src/services/appTooltipPolicy.ts')
      policy.installAppTooltipPolicy()
    }
  })
  const nav = page.getByRole('navigation', { name: '主导航', exact: true })
  for (const name of ['工作台', '资料库', '图谱', '设置']) {
    const link = nav.getByRole('link', { name, exact: true })
    assert.equal(await link.getAttribute('title'), null)
    assert.equal(await link.getAttribute('data-app-tooltip'), null)
    await link.hover()
    await page.waitForTimeout(500)
    assert.notEqual(await page.locator('#longedit-app-tooltip').getAttribute('data-visible'), 'true')
  }
  await nav.getByRole('link', { name: '图谱', exact: true }).hover()
  await page.screenshot({ path: out + '/hover.png', animations: 'disabled' })
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks: ['Four text-labelled links retain accessible names', 'No native or application tooltip after hovering each link'], scope: 'Actual App browser fixture with tooltip policy; mocked native IPC' }, null, 2) + '\n')
  console.log('Navigation hover checks passed')
} finally { await browser.close() }
