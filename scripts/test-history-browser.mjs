import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = path.resolve('docs/evidence/v110-history-ownership')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/history-browser.html')
  await page.waitForFunction(() => window.historyAudit?.pending.length > 0)
  await page.locator('#tab-history').click()
  await page.evaluate(() => { window.historyAudit.store.activateTab('C:/audit/B.md') })
  await page.waitForFunction(() => window.historyAudit.pending.some(item => item.path.endsWith('/B.md')))
  await page.evaluate(() => {
    for (const item of window.historyAudit.pending.filter(item => item.path.endsWith('/B.md'))) item.resolve([[1, 'B 的历史版本']])
  })
  await page.locator('.history-bubble').filter({ hasText: 'B 的历史版本' }).waitFor()
  await page.evaluate(() => {
    for (const item of window.historyAudit.pending.filter(item => item.path.endsWith('/A.md'))) item.resolve([[1, 'A 的迟到历史，不应显示']])
  })
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.history-bubble').count(), 1)
  assert.equal(await page.getByText('A 的迟到历史，不应显示').count(), 0)
  await page.screenshot({ path: path.join(out, '01-current-file-history.png') })
  await page.locator('.history-bubble').click()
  await page.getByText('历史内容已载入编辑区，尚未保存到文件', { exact: true }).waitFor()
  await page.waitForFunction(() => window.historyAudit.store.tabs.find(t => t.path.endsWith('/B.md')).content.includes('B 的历史版本'))
  assert.equal(await page.evaluate(() => window.historyAudit.store.tabs.find(t => t.path.endsWith('/A.md')).content), 'A 当前正文')
  assert.equal(await page.evaluate(() => window.historyAudit.store.tabs.find(t => t.path.endsWith('/B.md')).isDirty), true)
  assert.equal(await page.evaluate(() => window.historyAudit.calls.some(c => /^(save_|write_)/.test(c.command))), false)
  await page.screenshot({ path: path.join(out, '02-restored-draft.png') })
  await page.evaluate(() => {
    window.historyAudit.store.tabs.push({ id: 'C:/audit/missing.md', path: 'C:/audit/missing.md', title: 'missing.md', isDirty: false })
    window.historyAudit.store.activateTab('C:/audit/missing.md')
  })
  await page.waitForFunction(() => window.historyAudit.store.tabs.find(t => t.path.endsWith('/missing.md')).textReadOnlyReason)
  assert.equal(await page.locator('#vditor-lib [contenteditable="true"]').evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).length), 0)
  assert.equal(await page.locator('#vditor-lib').innerText().then(text => text.includes('B 的历史版本')), false)
  assert.equal(await page.evaluate(() => window.historyAudit.store.tabs.find(t => t.path.endsWith('/B.md')).content.includes('B 的历史版本')), true)
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(out, '03-missing-file-safe.png') })
  assert.deepEqual(errors, [])
  console.log('PASS: actual LibraryMode, late A history ignored, B-only draft restoration; simulated IPC')
} finally { await browser.close() }
