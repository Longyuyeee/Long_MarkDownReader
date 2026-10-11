import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = path.resolve('docs/evidence/v110-workbook-page-settings-browser')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workbook-save-browser.html')
  for (const [title, cls, field, value] of [
    ['页面设置', 'page-layout', 'select', 'landscape'],
    ['打印选项', 'print-options', 'input[type=checkbox]', true],
    ['页眉页脚', 'header-footer', 'textarea', '客户交付清单'],
  ]) {
    await page.getByRole('button', { name: title, exact: true }).click()
    const modal = page.locator(`.${cls}-modal`)
    const input = modal.locator(field).first()
    if (field === 'select') await input.selectOption(value)
    else if (typeof value === 'boolean') await input.check()
    else await input.fill(value)
    await modal.getByRole('button', { name: '应用', exact: true }).click()
    await page.waitForFunction(() => !!window.workbookAudit.pendingPageSetting)
    assert.equal(await modal.getByRole('button', { name: '应用', exact: true }).isDisabled(), true)
    assert.equal(await input.evaluate(element => !!element.closest('[inert]')), true)
    await page.evaluate(() => window.workbookAudit.pendingPageSetting(true))
    await page.getByText(`tasks.xlsx ${title}保存失败：模拟页面设置写入失败`, { exact: true }).waitFor()
    if (typeof value === 'boolean') assert.equal(await input.isChecked(), true)
    else assert.equal(await input.inputValue(), value)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(output, `${cls}-retry.png`) })
    await modal.getByRole('button', { name: '应用', exact: true }).click()
    await page.waitForFunction(() => !!window.workbookAudit.pendingPageSetting)
    await page.evaluate(() => window.workbookAudit.pendingPageSetting(false))
    await modal.waitFor({ state: 'hidden' })
    await page.getByText(`${title}已保存`, { exact: true }).waitFor()
    await page.getByRole('button', { name: title, exact: true }).click()
    if (typeof value === 'boolean') assert.equal(await input.isChecked(), true)
    else assert.equal(await input.inputValue(), value)
    await modal.getByRole('button', { name: '取消', exact: true }).click()
    await modal.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.querySelectorAll('.n-message').length === 0)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: three page-setting dialogs failure/retry/reopen; simulated IPC only')
} finally { await browser.close() }
