import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-structure-confirm-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
  await page.locator('.workbook-cell').first().click()
  await page.locator('.tool-panel-trigger').click()
  await page.getByText('单元格格式', { exact: true }).click()
  for (const [axis, selector, label] of [['row', '.row-number', '行'], ['column', '.column-header', '列']]) {
    await page.locator(selector).filter({ hasText: axis === 'row' ? /^1$/ : /^A$/ }).click()
    await page.screenshot({ path: path.join(output, `${axis}-selected.png`) })
    await page.getByTitle('整行整列插入与删除', { exact: true }).selectOption('delete')
    const dialog = page.getByRole('dialog').filter({ hasText: `删除 1 ${label}？` })
    await dialog.waitFor(); await page.waitForTimeout(300)
    assert.equal(await dialog.getByRole('button', { name: `删除${label}`, exact: true }).isVisible(), true)
    await page.screenshot({ path: path.join(output, `${axis}-delete-confirm.png`) })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.workbook-cell').first().locator('.cell-content').innerText(), '确认交付日期')
  }
  assert.deepEqual(errors, [])
  console.log('PASS: real row/column delete dialogs and cancellation; no structure writes exercised')
} finally { await browser.close() }
