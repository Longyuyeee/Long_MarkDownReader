import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = 'docs/evidence/v110-focus-layout'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), errors = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('region', { name: '工作现场', exact: true }).getByRole('button', { name: '继续工作', exact: true }).click()
  await page.locator('.vditor-wysiwyg').getByText('项目方案', { exact: true }).waitFor()
  await page.evaluate(() => { window.workflowAudit.store.theme = 'pink' })
  const toggle = page.getByTestId('library-focus-toggle')
  for (const [width, height] of [[1280,900], [760,540]]) {
    await page.setViewportSize({ width, height })
    const original = await page.locator('.vditor-wysiwyg').innerText()
    await toggle.click()
    await page.getByRole('navigation', { name: '主导航', exact: true }).waitFor({ state: 'hidden' })
    await page.waitForTimeout(300)
    const geometry = await page.evaluate(() => {
      const toolbar = document.querySelector('.vditor-toolbar').getBoundingClientRect()
      const exit = document.querySelector('[data-testid="library-focus-toggle"]').getBoundingClientRect()
      return { toolbarTop: toolbar.top, exitBottom: exit.bottom, height: innerHeight }
    })
    assert.ok(geometry.toolbarTop < 40, JSON.stringify(geometry))
    assert.ok(geometry.exitBottom <= height, JSON.stringify(geometry))
    assert.equal(await page.locator('.vditor-wysiwyg').innerText(), original)
    await page.screenshot({ path: `${out}/focus-${width}.png`, animations: 'disabled' })
    await toggle.click()
    await page.getByRole('navigation', { name: '主导航', exact: true }).waitFor()
    await page.locator('.library-shell-toolbar').waitFor()
    assert.equal(await page.locator('.vditor-wysiwyg').innerText(), original)
    checks.push({ width, height, geometry, contentRetained: true, exitRestoresNavigation: true })
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(out + '/results.json', JSON.stringify({ checks, errors, scope: 'Actual App/Vditor browser, mocked native IPC' }, null, 2) + '\n')
  console.log('Focus layout checks passed')
} finally { await browser.close() }
