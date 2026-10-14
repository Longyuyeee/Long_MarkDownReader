import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = path.resolve('docs/evidence/v110-inbox-archive-browser')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/inbox-archive-browser.html')
  await page.getByRole('button', { name: /会议记录.md/ }).waitFor()
  await page.screenshot({ path: path.join(out, process.argv.includes('--before') ? '00-before.png' : '01-inbox.png') })
  if (!process.argv.includes('--before')) {
    assert.equal(await page.getByRole('checkbox').count(), 0)
    assert.equal(await page.getByRole('button', { name: /归档/ }).count(), 0)
    await page.getByRole('button', { name: /会议记录.md/ }).click()
    assert.deepEqual(await page.evaluate(() => window.inboxAudit.opened), ['C:/audit/Inbox/会议记录.md'])
    assert.equal(await page.evaluate(() => window.inboxAudit.calls.some(item => /preflight_archive|move_|execute_/.test(item.command))), false)
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.goto('http://127.0.0.1:9000/scripts/fixtures/inbox-archive-browser.html?results=1')
    await page.getByRole('heading', { name: '归档未全部完成', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '打开文件', exact: true }).count(), 1)
    await page.getByRole('button', { name: '打开文件', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => window.inboxAudit.opened), ['项目/会议记录.md'])
    await page.getByRole('button', { name: '核对未完成项', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(out, '04-partial-results.png') })
    await page.setViewportSize({ width: 360, height: 800 })
    assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await page.screenshot({ path: path.join(out, '05-partial-narrow.png') })
    await page.getByRole('button', { name: '关闭并保留记录', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => window.inboxAudit.calls.map(item => item.command)), ['read-only-reconcile-requested', 'close-retain-record'])
  }
  console.log('PASS: Inbox direct open without archive step; retained inactive result component regression')
} finally { await browser.close() }
