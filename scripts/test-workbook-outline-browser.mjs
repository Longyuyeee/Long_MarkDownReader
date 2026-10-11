import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-outline-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
  await page.locator('.workbook-cell').first().click()
  await page.locator('.tool-panel-trigger').click()
  await page.getByText('单元格格式', { exact: true }).click()
  const menu = page.getByTitle('行列隐藏与分组', { exact: true })
  for (const [kind, selector, text] of [['row', '.row-number', /^1$/], ['column', '.column-header', /^A$/]]) {
    const heading = page.locator(selector).filter({ hasText: text })
    await heading.click()
    await menu.selectOption('group')
    await page.waitForFunction(() => !!window.workbookAudit.pendingOutline)
    assert.equal(await page.locator('input[placeholder="当前单元格不可编辑"]').isDisabled(), true)
    await page.evaluate(() => window.workbookAudit.pendingOutline(true))
    await page.getByText('tasks.xlsx 行列隐藏/分组保存失败：模拟分组写入失败', { exact: true }).waitFor()
    assert.equal(await heading.evaluate(element => element.classList.contains('outlined')), false)
    for (const action of ['group', 'hide', 'show', 'ungroup']) {
      await menu.selectOption(action)
      await page.waitForFunction(() => !!window.workbookAudit.pendingOutline)
      await page.evaluate(() => window.workbookAudit.pendingOutline(false))
      const success = { group: '分组层级已增加', hide: '所选行列已隐藏', show: '所选行列已显示', ungroup: '分组层级已减少' }[action]
      await page.getByText(success, { exact: true }).waitFor()
      assert.equal(await heading.evaluate(element => element.classList.contains('hidden')), action === 'hide')
      assert.equal(await heading.evaluate(element => element.classList.contains('outlined')), action !== 'ungroup')
      if (action === 'hide') {
        await page.waitForFunction(() => document.querySelectorAll('.n-message').length === 0)
        await page.screenshot({ path: path.join(output, `${kind}-hidden-grouped.png`) })
      }
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS: row/column group failure/retry/hide/show/ungroup; simulated IPC only')
} finally { await browser.close() }
