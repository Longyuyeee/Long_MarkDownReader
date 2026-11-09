import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline'), output = process.env.LONGEDIT_PACK_RETRY_OUTPUT || `docs/evidence/mobile-0.1.0/pack-read-retry-${baseline ? 'before' : 'candidate'}-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const fixture = process.env.LONGEDIT_PACK_IMPORT_FIXTURE || 'E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024'
const archive = await readFile(fixture + '/safe.textpack'), manifest = JSON.parse(await readFile(fixture + '/manifest.json', 'utf8'))
const id = '00000000-0000-4000-8000-000000000301', key = 'longedit-mobile-preview-v1', originalKey = JSON.stringify(['local', '原笔记.md'])
const entry = { id, name: '旅行笔记.textpack', created: 1793152800000, bytes: archive.length, status: 'ready', readable: true, count: 3, textName: 'text.markdown', assets: [], content: null, archive: archive.toString('base64'), archiveDigest: createHash('sha256').update(archive).digest('hex'), error: '', localPath: null }
const seed = { version: 1, documents: { [originalKey]: { rootId: 'local', relativePath: '原笔记.md', content: '原文\r\n', signature: 'original', modified: 1 } }, drafts: { [originalKey]: { rootId: 'local', relativePath: '原笔记.md', content: '未保存的输入😀\r\n', expectedSignature: 'original', revision: 7, updated: 1 } }, packImports: { [id]: entry } }
const report = { kind: 'pack-import-read-retry', baseline, nativeAndroidTest: false, checks: [], observed: {}, screens: [], errors: [], externalRequests: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true }); let page
const button = name => page.getByRole('button', { name, exact: true }), data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), back = () => page.evaluate(() => window.__longeditMobileBack())
const idle = () => page.waitForFunction(() => !document.querySelector('.pack-import-panel [role=status]')?.textContent?.includes('正在'))
async function open() { await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '附件包导入记录'); await page.getByRole('dialog', { name: '导入记录', exact: true }).waitFor(); await idle() }
async function readText() { await page.getByRole('button', { name: /^查看正文/ }).tap(); const value = await page.getByLabel('待导入正文（只读）', { exact: true }).inputValue(); await back(); await idle(); return value }
async function shot(name) {
  const top = await page.getByRole('alertdialog').isVisible() ? 0 : Math.max(0, Math.floor(Math.min((await page.locator('.preview-ribbon').boundingBox())?.height || 0, (await page.locator('.bottom-sheet').boundingBox()).y))), v = page.viewportSize()
  await page.screenshot({ path: output + '/' + name + '.png', clip: { x: 0, y: top, width: v.width, height: v.height - top } }); report.screens.push({ name, viewport: v, top })
  const geometry = await page.locator('.bottom-sheet').evaluate((root, top) => [...root.querySelectorAll('h2,h3,h4,p,button,textarea,li')].filter(e => e.checkVisibility() && !e.closest('[inert]')).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { tag: e.tagName, name: e.getAttribute('aria-label') || (e.tagName === 'TEXTAREA' ? e.value.trim() : e.textContent.trim()), x: r.x, y: r.y - top, width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, fontFamily: s.fontFamily } }), top)
  await writeFile(output + '/' + name + '-geometry.json', JSON.stringify(geometry, null, 2))
  if (baseline) {
    const html = await page.evaluate(() => { const root = document.documentElement.cloneNode(true); root.querySelectorAll('textarea').forEach((e, i) => { e.textContent = document.querySelectorAll('textarea')[i].value }); root.querySelectorAll('script,link[rel=modulepreload]').forEach(e => e.remove()); root.querySelectorAll('link[rel=stylesheet]').forEach(e => e.setAttribute('href', 'app.css')); return '<!doctype html>' + root.outerHTML })
    await writeFile(output + '/' + name + '.html', html)
  }
}
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const r = await page.evaluate(async () => { const r = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return { violations: r.violations.map(v => v.id), incomplete: r.incomplete.map(v => v.id) } })
  ;(report.accessibility ||= []).push({ name, ...r }); assert.deepEqual(r.violations, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(({ key, seed }) => {
    if (window !== window.top) return
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed))
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (k) { const stack = new Error().stack || ''; if (k === key && (window.__listFail && /\.packImports\s*\(/.test(stack) || window.__recordFail && /\.packImport\s*\(/.test(stack))) throw Error('READ_FAILED: 附件包暂时无法读取，请重试。'); return get.call(this, k) }
  }, { key, seed })
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== '127.0.0.1') report.externalRequests.push(r.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'); await button('添加资料').waitFor()
  await page.evaluate(() => { window.__listFail = true }); await open(); await page.getByRole('alert').filter({ hasText: '附件包暂时无法读取，请重试。' }).waitFor(); await shot('initial-failure')
  report.observed.falseEmpty = await page.getByText('暂无导入记录。', { exact: true }).isVisible()
  if (!baseline) assert.equal(report.observed.falseEmpty, false)
  await page.evaluate(() => { window.__listFail = false }); await button(baseline ? '刷新导入记录' : '重新读取导入记录').tap(); await idle()
  const row = page.locator(`[data-pack-import-id="${id}"]`); await row.waitFor(); await shot('list-recovered')
  report.observed.staleError = await page.getByRole('alert').filter({ hasText: '附件包暂时无法读取，请重试。' }).isVisible(); assert.equal(report.observed.staleError, false)
  assert.deepEqual(await data(), seed)
  await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle(); await shot('detail-failure')
  report.observed.inlineRetry = await button('重新读取附件包').isVisible(); assert.equal(await button('将笔记和附件存入手机资料库').count(), 0)
  await page.evaluate(() => { window.__recordFail = false })
  if (baseline) { await back(); await idle(); await row.tap(); await idle() } else { assert.equal(report.observed.inlineRetry, true); await button('重新读取附件包').tap(); await idle() }
  await button('将笔记和附件存入手机资料库').waitFor(); await page.locator('.bottom-sheet').evaluate(e => { e.scrollTop = 0 }); await shot('detail-recovered')
  assert.equal(await readText(), manifest.expected.content.replace(/\r\n|\r/g, '\n')); assert.equal(await page.getByLabel('待导入附件', { exact: true }).locator('li').count(), 3); assert.deepEqual(await data(), seed)
  // Missing private package bytes are a returned failed detail, not a thrown adapter error.
  await back(); await idle(); await page.evaluate(({ key, id }) => { const d = JSON.parse(localStorage.getItem(key)); d.packImports[id].archive = null; localStorage.setItem(key, JSON.stringify(d)) }, { key, id }); await row.tap(); await idle(); await shot('package-unavailable')
  report.observed.returnedFailureRetry = await button('重新读取附件包').isVisible(); assert.equal(await button('将笔记和附件存入手机资料库').count(), 0)
  if (baseline) { await button('移除记录').tap(); await page.getByRole('alertdialog').waitFor(); await shot('removal-warning'); await back() }
  if (!baseline) {
    assert.equal(report.observed.returnedFailureRetry, true)
    await scan('unavailable package'); const beforeRetry = await data(); await button('重新读取附件包').tap(); await idle(); assert.deepEqual(await data(), beforeRetry)
    await button('移除记录').tap(); await page.getByText('记录内容暂时无法读取。移除后，其中可能尚未存入的正文和附件也会移除。源文件和已存入的笔记、附件继续保留。', { exact: true }).waitFor(); await shot('removal-warning'); await back(); await button('重新读取附件包').waitFor(); assert.deepEqual(await data(), beforeRetry)
    await page.evaluate(({ key, id, archive }) => { const d = JSON.parse(localStorage.getItem(key)); d.packImports[id].archive = archive; localStorage.setItem(key, JSON.stringify(d)) }, { key, id, archive: entry.archive }); await button('重新读取附件包').tap(); await idle()
    await button('将笔记和附件存入手机资料库').waitFor(); assert.deepEqual(await data(), seed)
    report.checks.push('Initial list failure is distinct from empty; list and thrown/returned detail failures recover the same ID with exact text and three attachments, without implicit writes')
    report.checks.push('Missing private package bytes block commit; repeated retry and cancelled removal preserve the record, and restored bytes can be reverified in place')
    await page.getByRole('button', { name: /^附件清单/ }).tap(); await button('查看包内图片：assets/图 #.png').tap(); await page.getByAltText('包内图片：assets/图 #.png', { exact: true }).waitFor(); assert.equal(await page.getByAltText('包内图片：assets/图 #.png', { exact: true }).evaluate(e => e.complete && e.naturalWidth), 1); await back(); await back(); await button('将笔记和附件存入手机资料库').waitFor()
    assert.deepEqual(await data(), seed); report.checks.push('Reverified assets include a decoded image; Back closes the preview first and retains the package detail without committing')
    await back(); await idle(); await page.evaluate(() => { window.__listFail = true }); await button('刷新导入记录').tap(); await idle(); await row.waitFor(); await shot('cached-failure'); await scan('cached list failure')
    await page.evaluate(() => { window.__listFail = false }); await button('重新读取导入记录').tap(); await idle(); assert.equal(await page.getByRole('alert').count(), 0)
    const beforeCancel = await data(); await page.getByLabel('选择附件包文件', { exact: true }).dispatchEvent('cancel'); assert.deepEqual(await data(), beforeCancel)
    await back(); await idle(); await activateMobileRoot(page, '资料'); await button('切换深色').tap(); await open(); await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle(); await shot('dark-detail-failure'); await scan('dark detail failure')
    await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' }); await button('重新读取附件包').scrollIntoViewIfNeeded(); await shot('narrow-detail-failure'); await scan('320px 200% dark failure')
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog],[role=alertdialog]') && !document.activeElement?.closest('[inert]')), true) }
    report.checks.push('Failed refresh retains the last list and distinguishes stale data; browser cancel event, dark/narrow 200% text and modal keyboard focus preserve the same package')
    await page.setViewportSize({ width: 390, height: 872 }); await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; window.__recordFail = false }); await button('重新读取附件包').tap(); await idle(); await button('将笔记和附件存入手机资料库').tap(); await page.locator('.reader-header h1').waitFor()
    const final = await data(), receipt = final.packImports[id], folder = receipt.localPath.split('/').slice(0, -1).join('/')
    assert.equal(receipt.status, 'imported'); assert.equal(final.documents[JSON.stringify(['local', receipt.localPath])].content, manifest.expected.content)
    for (const [path, expected] of Object.entries(manifest.expected.assets)) assert.equal(final.attachments[JSON.stringify(['local', folder + '/' + path])].base64, expected.base64)
    assert.deepEqual(final.documents[originalKey], seed.documents[originalKey]); assert.deepEqual(final.drafts, seed.drafts); assert.equal(Object.keys(final.packImports).length, 1)
    report.checks.push('Explicit confirmation after reverify publishes exact original text and every binary asset once, retaining the original document, unsaved draft and package archive')
    await button('返回资料库').tap()
    await page.evaluate(({ key, created }) => { const d = JSON.parse(localStorage.getItem(key)); for (let i = 0; i < 4; i++) d.packImports['history-' + i] = { id: 'history-' + i, name: `旧记录${i}－${'需要完整辨认的附件包名称'.repeat(8)}.textpack`, created: created + i + 1, bytes: 0, status: 'failed', readable: false, count: 0, content: null, textName: '', assets: [], archiveDigest: '', error: 'INVALID_PATH: 包内路径无效，请重新导出。', localPath: null }; localStorage.setItem(key, JSON.stringify(d)) }, { key, created: entry.created })
    await open(); await row.scrollIntoViewIfNeeded(); await row.focus()
    const oldTop = await page.locator('.pack-import-body').evaluate(e => e.scrollTop), deepBefore = await data(); assert.ok(oldTop > 0)
    await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle(); await page.evaluate(() => { window.__recordFail = false }); await button('重新读取附件包').tap(); await idle(); await button('打开已导入笔记').waitFor(); await back(); await idle()
    assert.equal(await row.evaluate(e => e === document.activeElement), true); assert.ok(Math.abs(await page.locator('.pack-import-body').evaluate(e => e.scrollTop) - oldTop) <= 2); assert.deepEqual(await data(), deepBefore)
    await page.locator('[data-pack-import-id="history-0"]').tap(); await idle(); assert.equal(await button('重新读取附件包').count(), 0); await page.getByRole('alert').filter({ hasText: '包内路径无效，请重新导出。' }).waitFor(); assert.equal(await page.getByText('INVALID_PATH: 包内路径无效，请重新导出。', { exact: true }).count(), 0); await back(); await idle()
    report.checks.push('Retry preserves the selected receipt focus and nonzero history scroll; persisted format errors retain their identity and display a human reason without a misleading read retry')
    await page.evaluate(() => { window.__recordFail = true }); await page.getByLabel('选择附件包文件', { exact: true }).setInputFiles({ name: '新收到.textpack', mimeType: 'application/octet-stream', buffer: archive }); await idle(); await button('重新读取附件包').waitFor()
    const stagedData = await data(), staged = Object.values(stagedData.packImports).find(e => e.name === '新收到.textpack'); assert.ok(staged); assert.equal(staged.archive, entry.archive); assert.equal(Object.keys(stagedData.documents).length, Object.keys(deepBefore.documents).length)
    await page.evaluate(() => { window.__recordFail = false }); await button('重新读取附件包').tap(); await idle(); await button('将笔记和附件存入手机资料库').waitFor(); assert.deepEqual(await data(), stagedData)
    report.checks.push('A just-chosen package whose detail read fails retains the new receipt and full archive; retry neither chooses again nor publishes a duplicate')
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  }
  const css = await page.locator('link[rel=stylesheet]').first().getAttribute('href'); await writeFile(output + '/app.css', await (await page.request.get(new URL(css, page.url()).href)).body())
} catch (e) { report.failure = String(e.stack || e); process.exitCode = 1; if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {}) }
finally { await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, observed: report.observed, checks: report.checks.length, failure: report.failure }, null, 2)) }
