import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/text-export-browser-${Date.now()}`
await mkdir(output, { recursive: true })
await writeFile(path.join(output, '.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'text-export-tasks', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const key = JSON.stringify(['local', '随记.md']), content = '\ufeff# 随记😀\r\n第一行\r第二行\n![图](attachments/a.png)\r\n'
let page
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const protectedDraft = ({ updated, ...draft }) => draft
const action = () => page.getByRole('button', { name: /^(下载文字副本|重新选择位置导出|重试下载)$/ })
async function openExport() { await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '导出当前内容副本', exact: true }).tap(); await page.getByRole('dialog', { name: '导出文字副本' }).waitFor(); await page.waitForFunction(() => document.querySelector('.mobile-workspace')?.inert === true); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) }
async function downloadText() { const pending = page.waitForEvent('download'); await action().tap(); const download = await pending; assert.equal(download.suggestedFilename(), '随记-导出副本.md'); return readFile(await download.path(), 'utf8') }
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ key, content }) => {
    if (window !== window.top) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [key]: { rootId: 'local', relativePath: '随记.md', content, signature: 'original', modified: 1 } }, drafts: {} }))
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function() { if (window.__rejectDownload && this.download) throw new Error('模拟浏览器下载被阻止'); return click.call(this) }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (window.__rejectExportStage && key === 'longedit-mobile-preview-v1' && Object.values(JSON.parse(value).recoveries || {}).some(record => record.purpose === 'text-export')) throw new DOMException('模拟空间不足', 'QuotaExceededError'); return setItem.call(this, key, value) }
  }, { key, content })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.file-row').filter({ hasText: '随记.md' }).tap()
  await openExport(); assert.equal(await downloadText(), content)
  await page.getByRole('heading', { name: '已发起下载', exact: true }).waitFor(); await page.getByText('请在浏览器下载记录中核对文件。', { exact: true }).waitFor()
  assert.equal((await data()).documents[key].content, content); assert.deepEqual((await data()).drafts, {}); assert.equal(Object.keys((await data()).recoveries || {}).length, 0)
  await page.screenshot({ path: path.join(output, '360-exported.png') })
  report.checks.push('A real browser download preserves every UTF-8 character, BOM, mixed line ending and image reference; a clean source remains clean')

  await page.getByRole('button', { name: '返回文档', exact: true }).tap()
  await page.getByRole('button', { name: '编辑', exact: true }).tap()
  const candidate = '未保存中文😀\r\n![图](attachments/a.png)\r\n完整尾行\r\n'
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(candidate)
  await openExport(); const before = protectedDraft((await data()).drafts[key])
  await page.getByText(/包含未保存内容；原笔记仍需保存/).waitFor()
  assert.equal(await downloadText(), candidate)
  assert.equal((await data()).documents[key].content, content); assert.deepEqual(protectedDraft((await data()).drafts[key]), before)
  await page.getByRole('button', { name: '返回文档', exact: true }).tap(); await page.getByText('草稿已保护', { exact: true }).waitFor()
  report.checks.push('Exporting unsaved input downloads the captured candidate while preserving the original content, draft revision, expected signature and dirty state')

  await openExport(); await page.evaluate(() => { window.__rejectDownload = true }); await action().tap()
  await page.getByRole('alert').getByText(/模拟浏览器下载被阻止/).waitFor()
  let records = Object.values((await data()).recoveries || {}); assert.equal(records.length, 1); const id = records[0].id
  assert.equal(records[0].purpose, 'text-export'); assert.equal(records[0].candidate, candidate)
  await page.evaluate(() => { window.__rejectDownload = false }); assert.equal(await downloadText(), candidate)
  assert.equal((await data()).recoveries[id], undefined); assert.deepEqual(protectedDraft((await data()).drafts[key]), before)
  report.checks.push('A blocked download leaves a full durable export record; retry exports the same snapshot and clears only that export record')

  await page.getByRole('button', { name: '返回文档', exact: true }).tap(); await openExport()
  await page.evaluate(() => { window.__rejectDownload = true }); await action().tap(); await page.getByRole('alert').waitFor()
  records = Object.values((await data()).recoveries); assert.equal(records.length, 1)
  await page.reload(); await page.getByRole('button', { name: '设置', exact: true }).tap(); await page.getByRole('button', { name: '保存恢复记录', exact: true }).tap()
  await page.locator('[data-recovery-id]').filter({ hasText: '导出副本' }).tap()
  await page.getByRole('heading', { name: '取回这次导出', exact: true }).waitFor()
  assert.equal(await page.getByLabel('导出内容', { exact: true }).inputValue(), candidate.replace(/\r\n/g, '\n'))
  assert.equal(await page.getByText(/原文件可能只写入了一部分/).count(), 0)
  await page.getByRole('button', { name: '将导出内容存入手机资料库', exact: true }).tap()
  await page.locator('.reader-header h1').waitFor(); const stored = Object.values((await data()).documents).find(doc => doc.relativePath !== '随记.md')
  assert.equal(stored.content, candidate); assert.equal((await data()).recoveries[records[0].id].candidate, candidate); assert.equal((await data()).documents[key].content, content); assert.deepEqual(protectedDraft((await data()).drafts[key]), before)
  report.checks.push('After reload, export records are distinctly labelled and can create a complete independent local note without changing the original source, draft or recovery record')

  await openExport(); await page.evaluate(() => { window.__rejectExportStage = true }); await action().tap()
  await page.getByRole('alert').getByText(/本机存储空间不足/).waitFor(); assert.equal(Object.keys((await data()).recoveries).length, 1)
  await page.evaluate(() => { window.__rejectExportStage = false; document.documentElement.style.fontSize = '32px' })
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  report.accessibility = await page.evaluate(async () => { const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return { violations: result.violations.map(({id}) => id), incomplete: result.incomplete.map(({id}) => id) } })
  assert.deepEqual(report.accessibility.violations, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, '360-export-failure-200.png'), fullPage: true })
  report.checks.push('A failed snapshot stage never starts a download; the retry and recovery controls remain usable at 200% text with no checked accessibility violations')
  await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
  await page.getByRole('button', { name: '返回文档', exact: true }).tap()
  await page.getByRole('button', { name: '返回设置', exact: true }).tap()
  await page.getByRole('button', { name: '资料', exact: true }).tap()
await page.getByRole('button', { name: '最近', exact: true }).tap()
  await page.locator('.file-row').filter({ has: page.getByText('随记.md', { exact: true }) }).tap()
  await page.getByRole('button', { name: '继续这份草稿', exact: true }).tap()
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  const restoredBefore = protectedDraft((await data()).drafts[key])
  await openExport()
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) }
  assert.deepEqual(protectedDraft((await data()).drafts[key]), restoredBefore)
  await page.screenshot({ path: path.join(output, '360-restored-draft-export.png') })
  report.checks.push('A reopened recovery draft can enter export with the document hidden from accessibility and modal keyboard focus contained; the source draft remains intact')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if(page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, checks: report.checks, passed: report.passed, failure: report.failure }, null, 2)) }
