// Approval preview only: styles are injected into an isolated browser, never production files.
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-modal-width-proposal')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
  for (const [title, cls] of [['页面设置', 'page-layout'], ['打印选项', 'print-options'], ['页眉页脚', 'header-footer']]) {
    await page.getByRole('button', { name: title, exact: true }).click()
    const modal = page.locator(`.${cls}-modal`)
    await modal.waitFor(); await page.waitForTimeout(350)
    const before = await modal.boundingBox()
    await page.screenshot({ path: path.join(output, `${cls}-before.png`) })
    const style = await page.addStyleTag({ content: `.${cls}-modal { width: min(680px, calc(100vw - 32px)); }` })
    const after = await modal.boundingBox()
    assert.equal(Math.round(after.width), 680)
    assert.equal(await modal.getByRole('button', { name: '应用', exact: true }).isVisible(), true)
    await page.screenshot({ path: path.join(output, `${cls}-proposal.png`) })
    console.log(title, JSON.stringify({ before, proposal: after }))
    await modal.getByRole('button', { name: '取消', exact: true }).click()
    await modal.waitFor({ state: 'hidden' })
    await style.evaluate(element => element.remove())
  }
} finally { await browser.close() }
