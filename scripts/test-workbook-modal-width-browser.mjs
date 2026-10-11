import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-modal-width-implemented')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  for (const width of [1280, 800, 640]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
    for (const [title, cls] of [['页面设置', 'page-layout'], ['打印选项', 'print-options'], ['页眉页脚', 'header-footer']]) {
      await page.getByRole('button', { name: title, exact: true }).click()
      const modal = page.locator(`.${cls}-modal`)
      await modal.waitFor(); await page.waitForTimeout(350)
      const bounds = await modal.boundingBox()
      assert.equal(Math.round(bounds.width), Math.min(680, width - 32))
      assert.ok(bounds.x >= 16 && bounds.x + bounds.width <= width - 16)
      const overflow = await modal.evaluate(element => element.scrollWidth > element.clientWidth + 1)
      assert.equal(overflow, false, `${title}: modal overflow at ${width}`)
      for (const button of ['取消', '应用']) assert.equal(await modal.getByRole('button', { name: button, exact: true }).isVisible(), true)
      await page.screenshot({ path: path.join(output, `${cls}-${width}.png`) })
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS: three production dialogs at 1280/800/640; no injected CSS')
} finally { await browser.close() }
