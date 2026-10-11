import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-save-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
  const cell = page.locator('.workbook-cell').first()
  await cell.waitFor(); await cell.dblclick()
  const formula = page.locator('input[placeholder="当前单元格不可编辑"]')
  await formula.fill('先核对交付日期'); await formula.press('Enter')
  await page.screenshot({ path: path.join(output, '01-draft.png') })
  await page.getByRole('button', { name: '保存 (1)', exact: true }).click()
  await page.waitForFunction(() => !!window.workbookAudit.pending)
  assert.equal(await formula.isDisabled(), true)
  await page.evaluate(() => { window.workbookAudit.failNext = true; window.workbookAudit.pending() })
  await page.getByText('tasks.xlsx 保存失败：模拟磁盘失败', { exact: true }).waitFor()
  await page.waitForTimeout(250) // Let the actual message enter animation finish for the screenshot.
  assert.equal(await formula.inputValue(), '先核对交付日期')
  await page.screenshot({ path: path.join(output, '02-failed.png') })
  await page.getByRole('button', { name: '保存 (1)', exact: true }).click()
  await page.waitForFunction(() => !!window.workbookAudit.pending)
  await page.evaluate(() => window.workbookAudit.pending())
  await page.getByRole('button', { name: '已保存', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.n-message').length === 0)
  await page.screenshot({ path: path.join(output, '03-saved.png') })
  assert.deepEqual(errors, [])
  console.log('PASS: actual WorkbookView ordinary edit, save failure and retry; simulated IPC only')
} finally { await browser.close() }
