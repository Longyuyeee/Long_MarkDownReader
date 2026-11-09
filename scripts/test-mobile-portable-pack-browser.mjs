import { leavePackResult } from './mobile-pack-navigation.mjs'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/portable-pack-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'portable-pack-tasks', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const key = JSON.stringify(['local', '随记.md']), imageKey = JSON.stringify(['local', 'files/图 #.png']), pdfKey = JSON.stringify(['local', 'files/a.pdf'])
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7N8AAAAASUVORK5CYII='
const content = '\ufeff# 随记😀\r\n![图](files/%E5%9B%BE%20%23.png)\r[资料](files/a.pdf#page=2)\n[同一图](files/%E5%9B%BE%20%23.png)\r\n[网页](https://example.com)\r\n'
const candidate = content + '未保存的尾行😀\r\n'
let page
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const withoutTime = ({ updated, ...record }) => record
async function openPack() { await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '导出笔记与附件', exact: true }).tap(); await page.getByRole('button', { name: '下载笔记与附件', exact: true }).waitFor() }
async function closePack() { for (let i = 0; i < 5 && await page.locator('.export-task-sheet').count(); i++) await page.evaluate(() => window.__longeditMobileBack()); assert.equal(await page.locator('.export-task-sheet').count(), 0) }
async function firstRecord() { await page.locator('[data-pack-id]').first().tap(); await page.getByRole('heading', { name: '附件包详情', exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector('.export-task-sheet .sheet-heading button')?.disabled) }
async function download(button) { const pending = page.waitForEvent('download'); await button.tap(); const file = await pending; assert.equal(file.suggestedFilename(), '随记-附件包.textpack'); return readFile(await file.path()) }
function unzip(bytes) {
  const result = spawnSync('python', ['-c', 'import sys,zipfile,io,json,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist() if not n.endswith("/")}))'], { input: bytes, maxBuffer: 20 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString()); return Object.fromEntries(Object.entries(JSON.parse(result.stdout)).map(([name, value]) => [name, Buffer.from(value, 'base64')]))
}
const rewritten = text => text.replaceAll('files/%E5%9B%BE%20%23.png', 'assets/001-%E5%9B%BE%20%23.png').replace('files/a.pdf', 'assets/002-a.pdf').replaceAll('](assets/', '](<assets/').replaceAll('.png)', '.png>)').replaceAll('#page=2)', '#page=2>)')
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ key, imageKey, pdfKey, content, png }) => {
    if (window !== window.top) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [key]: { rootId: 'local', relativePath: '随记.md', content, signature: 'original', modified: 1 } }, drafts: {}, images: { [imageKey]: { dataUrl: `data:image/png;base64,${png}`, width: 1, height: 1, bytes: atob(png).length } }, attachments: { [pdfKey]: { base64: 'AAH/AA==' } } }))
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function() { if (window.__rejectPackDownload && this.download) throw new Error('模拟下载被阻止'); return click.call(this) }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (window.__rejectPackStage && key === 'longedit-mobile-preview-v1' && Object.keys(JSON.parse(value).packExports || {}).length) throw new DOMException('模拟空间不足', 'QuotaExceededError'); return setItem.call(this, key, value) }
  }, { key, imageKey, pdfKey, content, png })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.file-row').filter({ hasText: '随记.md' }).tap(); await openPack()
  const clean = unzip(await download(page.getByRole('button', { name: '下载笔记与附件', exact: true })))
  assert.equal(clean['note.textbundle/text.markdown'].toString(), rewritten(content)); assert.deepEqual((await data()).drafts, {})
  await page.getByRole('button', { name: '查看附件包导出记录', exact: true }).tap(); await firstRecord(); await page.getByRole('button', { name: '移除记录', exact: true }).tap(); await page.getByRole('button', { name: '确认移除记录', exact: true }).tap(); await page.getByText('本机记录已移除，原笔记、附件和已导出文件仍保留。', { exact: true }).waitFor()
  await closePack(); await page.getByRole('button', { name: '编辑', exact: true }).tap()
  report.checks.push('Clean source export preserves BOM and every original mixed line separator; no draft is created')
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(candidate); await openPack()
  const before = await data(), draft = withoutTime(before.drafts[key])
  await page.getByRole('button', { name: /^附件清单/ }).tap(); await page.getByLabel('将携带的附件').waitFor(); assert.equal(await page.getByLabel('将携带的附件').locator('li').count(), 2); await page.evaluate(() => window.__longeditMobileBack())
  assert.equal(await page.evaluate(() => document.querySelector('.mobile-workspace').inert), true)
  const bytes = await download(page.getByRole('button', { name: '下载笔记与附件', exact: true })), members = unzip(bytes)
  await writeFile(path.join(output, 'exported.textpack'), bytes)
  assert.deepEqual(Object.keys(members).sort(), ['note.textbundle/assets/001-图 #.png', 'note.textbundle/assets/002-a.pdf', 'note.textbundle/info.json', 'note.textbundle/text.markdown'].sort())
  assert.equal(members['note.textbundle/text.markdown'].toString(), rewritten(draft.content))
  assert.equal(JSON.parse(members['note.textbundle/info.json']).version, 2)
  assert.equal(members['note.textbundle/assets/001-图 #.png'].toString('base64'), png); assert.deepEqual([...members['note.textbundle/assets/002-a.pdf']], [0,1,255,0])
  assert.equal((await data()).documents[key].content, content); assert.deepEqual(withoutTime((await data()).drafts[key]), draft)
  await page.getByRole('heading', {name:'已发起下载',exact:true}).waitFor(); await page.screenshot({ path: path.join(output, '360-exported.png') })
  report.checks.push('Real TextPack download passes independent Python zipfile CRC checks: standard V2 structure, exact mixed-newline/BOM draft, rewritten links, deduplicated binary assets and unchanged source/draft')

  await leavePackResult(page)
  await page.evaluate(() => { window.__rejectPackDownload = true }); await page.getByRole('button', { name: '下载笔记与附件', exact: true }).tap()
  await page.getByRole('alert').filter({ hasText: '模拟下载被阻止' }).waitFor(); assert.equal(Object.keys((await data()).packExports).length, 1)
  await page.getByRole('button', { name: '查看附件包导出记录', exact: true }).tap(); await firstRecord(); await page.getByRole('button', { name: '再次下载', exact: true }).waitFor()
  for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) }
  await page.evaluate(() => { window.__rejectPackDownload = false; const key = 'longedit-mobile-preview-v1', data = JSON.parse(localStorage.getItem(key)); data.images = {}; data.attachments = {}; localStorage.setItem(key, JSON.stringify(data)) })
  await page.reload(); await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '附件包导出记录')
  await firstRecord(); await page.getByLabel('包内附件', {exact:true}).waitFor(); assert.equal(await page.getByLabel('包内附件', {exact:true}).locator('li').count(),2)
  assert.deepEqual(await download(page.getByRole('button', { name: '再次下载', exact: true })), bytes)
  await leavePackResult(page)
  report.checks.push('Blocked download keeps one protected package; after reload and loss of all source attachments, history inspection/retry downloads identical bytes and contains keyboard focus')

  await page.evaluate(() => { const key = 'longedit-mobile-preview-v1', data = JSON.parse(localStorage.getItem(key)); const record = Object.values(data.packExports)[0]; record.archive = 'AAAA' + record.archive.slice(4); localStorage.setItem(key, JSON.stringify(data)) })
  await page.getByRole('button', { name: '再次下载', exact: true }).tap(); await page.getByRole('alert').filter({ hasText: '核对失败' }).waitFor()
  assert.equal(Object.keys((await data()).packExports).length, 1)
  await page.getByRole('button', { name: '移除记录', exact: true }).tap(); assert.equal(Object.keys((await data()).packExports).length, 1)
  await page.getByRole('button', { name: '继续保留', exact: true }).tap(); await page.getByRole('button', { name: '移除记录', exact: true }).tap(); await page.getByRole('button', { name: '确认移除记录', exact: true }).tap()
  await page.getByText('本机记录已移除，原笔记、附件和已导出文件仍保留。', { exact: true }).waitFor(); assert.equal(Object.keys((await data()).packExports).length, 0)
  assert.equal((await data()).documents[key].content, content); assert.deepEqual(withoutTime((await data()).drafts[key]), draft)
  report.checks.push('Corrupt package is blocked and retained; record deletion requires explicit confirmation, cancel keeps it, confirm changes neither source nor draft')

  await closePack(); await activateMobileRoot(page, '资料'); await page.locator('.file-row').filter({ hasText: '随记.md' }).tap(); await page.getByRole('button', { name: '继续这份草稿', exact: true }).tap()
  await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '导出笔记与附件', exact: true }).tap()
  await page.getByRole('alert').filter({ hasText: '无法携带' }).waitFor(); assert.equal(await page.getByRole('button', { name: '下载笔记与附件', exact: true }).count(), 0)
  assert.equal(Object.keys((await data()).packExports).length, 0)
  report.checks.push('Missing source image fails before package persistence or download, with no silent text-only fallback')
  await page.evaluate(({ imageKey, pdfKey, png }) => { const key = 'longedit-mobile-preview-v1', data = JSON.parse(localStorage.getItem(key)); data.images[imageKey] = { dataUrl: `data:image/png;base64,${png}`, width: 1, height: 1, bytes: atob(png).length }; data.attachments[pdfKey] = { base64: 'AAH/AA==' }; localStorage.setItem(key, JSON.stringify(data)); window.__rejectPackStage = true }, { imageKey, pdfKey, png })
  await page.getByRole('button', { name: '重新检查附件', exact: true }).tap(); await page.getByRole('button', { name: '下载笔记与附件', exact: true }).tap(); await page.getByRole('alert').filter({ hasText: '本机存储空间不足' }).waitFor()
  assert.equal(Object.keys((await data()).packExports).length, 0)
  await page.evaluate(() => { window.__rejectPackStage = false; document.documentElement.style.fontSize = '32px' })
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  report.accessibility = await page.evaluate(async () => { const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return { violations: result.violations.map(({id}) => id) } })
  assert.deepEqual(report.accessibility.violations, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, '360-failure-200.png'), fullPage: true })
  report.checks.push('Local quota failure starts no download and invents no retained record; failure/manifests/actions fit 360px at 200% text with no checked axe violations')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if(page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, checks: report.checks, passed: report.passed, failure: report.failure }, null, 2)) }
