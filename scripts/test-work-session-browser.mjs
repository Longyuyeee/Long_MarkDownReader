import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = path.resolve('docs/evidence/v110-work-session-browser')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/work-session-browser.html')
  const bar = page.getByRole('region', { name: '工作现场', exact: true })
  await bar.getByRole('button', { name: '命名保存…' }).click()
  await bar.getByLabel('名称', { exact: true }).fill('周五客户交付')
  await bar.getByRole('button', { name: '保存现场', exact: true }).click()
  await bar.getByRole('status').filter({ hasText: '已记住' }).waitFor()
  assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('用户尚未保存的原稿'))), false)
  await page.screenshot({ path: path.join(out, '01-named-session.png') })
  await page.evaluate(() => {
    const store = window.sessionAudit.store
    store.tabs.push({ id: 'C:/audit/新增草稿.md', path: 'C:/audit/新增草稿.md', title: '新增草稿.md', content: '不要丢弃我', isDirty: true })
  })
  await bar.getByRole('button', { name: '继续工作', exact: true }).click()
  assert.equal(await page.evaluate(() => window.sessionAudit.router.currentRoute.value.name), 'LibraryMode')
  assert.equal(await page.evaluate(() => window.sessionAudit.store.tabs.find(t => t.path.endsWith('新增草稿.md')).content), '不要丢弃我')
  assert.equal(await page.evaluate(() => window.sessionAudit.store.tabs.find(t => t.path.endsWith('/方案.md')).content), '用户尚未保存的原稿')
  await page.reload()
  await bar.getByLabel('工作现场', { exact: true }).selectOption({ label: '周五客户交付' })
  await page.setViewportSize({ width: 640, height: 800 })
  await page.screenshot({ path: path.join(out, '02-reloaded-narrow.png') })
  assert.equal(await bar.evaluate(el => el.scrollWidth > el.clientWidth), false)
  assert.deepEqual(errors, [])
  assert.equal(await page.evaluate(() => window.sessionAudit.calls.some(c => /^(save_|write_)/.test(c.command))), false)
  console.log('PASS actual WorkspaceHome: named session, reload, preserved dirty tabs, main editor route, no document writes; simulated IPC')
} finally { await browser.close() }
