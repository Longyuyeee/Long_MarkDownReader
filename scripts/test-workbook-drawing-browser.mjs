import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-drawing-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html?chart=1')
  await page.locator('.workbook-cell').first().click()
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift')
  await page.locator('.tool-panel-trigger').click()
  await page.getByText('图表与绘图对象', { exact: true }).click()
  const create = async () => {
    await page.getByRole('button', { name: '从选区创建图表', exact: true }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: '创建图表' })
    await dialog.locator('input').fill('客户交付进度')
    await dialog.getByRole('button', { name: '创建图表', exact: true }).click()
    await page.waitForFunction(() => !!window.workbookAudit.pendingDrawing)
    await dialog.waitFor({ state: 'hidden' })
  }
  await create()
  assert.equal(await page.getByRole('button', { name: '从选区创建图表', exact: true }).isDisabled(), true)
  await page.evaluate(() => window.workbookAudit.pendingDrawing(true))
  await page.getByText('tasks.xlsx 绘图对象保存失败：模拟绘图写入失败', { exact: true }).waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(output, '01-drawing-failure.png') })
  await create()
  await page.locator('.sheet-tabs button').filter({ hasText: 'Sheet2' }).click()
  await page.evaluate(() => window.workbookAudit.pendingDrawing(false))
  await page.getByText('已从当前选区创建图表', { exact: true }).waitFor()
  assert.equal((await page.locator('.sheet-tabs button.active').innerText()).trim(), 'Sheet2')
  assert.equal(await page.evaluate(() => window.workbookAudit.drawingChange.sheet), 'Sheet1')
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(output, '02-current-sheet-preserved.png') })
  assert.deepEqual(errors, [])
  console.log('PASS: drawing failure/retry/save lock/sheet preservation; simulated IPC, not chart fidelity')
} finally { await browser.close() }
