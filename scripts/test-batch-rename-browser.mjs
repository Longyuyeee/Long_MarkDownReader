import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v114-batch-rename'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const errors = [], checks = [], layouts = []
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/batch-rename-browser.html'); await page.getByRole('link', { name: '资料库', exact: true }).click()
  const project = page.locator('[data-drop-path="C:/workflow-fixture/项目方案.md"]'), meeting = page.locator('[data-drop-path="C:/workflow-fixture/会议记录.md"]')
  await project.click(); await meeting.click({ modifiers: ['Control'] }); await project.click({ button: 'right' }); await page.getByText('批量重命名…', { exact: true }).click()
  const modal = page.locator('.batch-rename-dialog')
  await modal.waitFor(); await page.waitForFunction(() => document.querySelectorAll('.rename-row').length === 2)
  assert.equal(await modal.getByRole('button', { name: '重命名 0 项', exact: true }).isDisabled(), true)
  await modal.getByRole('textbox', { name: '名称前添加', exact: true }).fill('?')
  await page.waitForFunction(() => document.querySelectorAll('.rename-row.has-error').length === 2)
  assert.equal(await modal.getByRole('button', { name: '重命名 0 项', exact: true }).isDisabled(), true)
  await modal.getByRole('textbox', { name: '名称前添加', exact: true }).fill('整理-')
  await modal.getByRole('button', { name: '重命名 2 项', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.querySelector('.rename-preview[aria-busy="true"]'))
  checks.push('Multiselection right click opens preview; unchanged and invalid names cannot be submitted')
  for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) for (const width of [1280, 480]) {
    await page.setViewportSize({ width, height: 950 }); await page.evaluate(style => { window.workflowAudit.store.visualStyle = style; window.workflowAudit.store.theme = style === 'glass' ? 'dark' : 'green'; document.documentElement.dataset.style = style }, style)
    const box = await modal.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
    assert.ok(await modal.getByRole('button', { name: '重命名 2 项', exact: true }).isVisible()); layouts.push({ style, width, dialogFits: true })
  }
  await page.setViewportSize({ width: 1280, height: 950 }); await page.screenshot({ path: output + '/preview.png' })
  await page.evaluate(() => window.workflowAudit.renameFailure = true)
  await modal.getByRole('button', { name: '重命名 2 项', exact: true }).click(); await modal.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(() => window.workflowAudit.store.activeTabId), 'C:/workflow-fixture/整理-项目方案.md')
  assert.ok(await page.evaluate(() => Object.keys(window.workflowAudit.store.fileDisplayStyles).some(path => path.endsWith('/整理-项目方案.md'))))
  assert.equal(await modal.locator('.rename-row.completed').count(), 1)
  assert.match(await modal.textContent(), /文件暂时被占用/)
  await page.evaluate(() => window.workflowAudit.renameFailure = false)
  await modal.getByRole('button', { name: '重试剩余 1 项', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.rename-row.completed').length === 2)
  const calls = await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'rename_library_items'))
  assert.equal(calls[1].args.items.length, 1); assert.ok(calls[1].args.items[0].path.endsWith('/会议记录.md'))
  checks.push('Partial success updates open tabs and display style; retry submits only the failed item with the original previewed name')
  await modal.getByRole('button', { name: '完成', exact: true }).click(); await project.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('#crash-screen').count(), 0); assert.deepEqual(errors, [])
  await fs.writeFile(output + '/report.json', JSON.stringify({ scope: 'Actual Vue components and input gestures, simulated native IPC; native rules and filesystem tested separately', checks, layouts, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ checks: checks.length, layouts: layouts.length, errors: errors.length }))
} catch (error) { await page.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error }
finally { await browser.close() }
