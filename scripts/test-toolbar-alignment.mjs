import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = 'docs/evidence/v110-toolbar-alignment'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), errors = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
  await page.getByTitle('导出文档', { exact: true }).waitFor()
  for (const theme of ['white', 'pink', 'dark']) {
    await page.evaluate(theme => {
      window.shellAudit.store.theme = theme
      document.body.setAttribute('data-theme', theme)
    }, theme)
    await page.waitForTimeout(100)
    const measured = await page.evaluate(() => {
      const center = el => { const r = el.getBoundingClientRect(); return r.y + r.height / 2 }
      const base = center(document.querySelector('.vditor-toolbar [data-type="bold"]'))
      return [...document.querySelectorAll('.document-inline-shortcuts button')].map(el => ({ label: el.textContent, delta: Math.abs(center(el) - base) }))
    })
    assert.ok(measured.length >= 4)
    assert.ok(measured.every(item => item.delta <= 1), JSON.stringify(measured))
    checks.push({ theme, measured })
    await page.screenshot({ path: `${out}/${theme}.png`, animations: 'disabled' })
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ checks, errors, scope: 'Actual Vue/Vditor browser, mocked native IPC' }, null, 2) + '\n')
  console.log('Toolbar centers aligned in light, pink and dark themes')
} finally { await browser.close() }
