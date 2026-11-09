import { readTextImportPreview } from './mobile-text-import-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = process.env.LONGEDIT_IMPORT_RETRY_OUTPUT || `docs/evidence/mobile-0.1.0/import-read-retry-${baseline ? 'before' : 'candidate'}-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const key = 'longedit-mobile-preview-v1', content = '\ufeff# 行程核对😀\r\n杭州 → 苏州\r保留这份输入\n', id = '00000000-0000-4000-8000-000000000201'
const digest = createHash('sha256').update(content).digest('hex')
const entry = { id, name: '行程核对.md', created: 1793152800000, bytes: Buffer.byteLength(content), status: 'ready', readable: true, content, digest, error: '', localPath: null }
const docKey = JSON.stringify(['local', '原笔记.md'])
const seed = { version: 1, documents: { [docKey]: { rootId: 'local', relativePath: '原笔记.md', content: '原文\r\n', signature: 'source', modified: 1 } }, drafts: { [docKey]: { rootId: 'local', relativePath: '原笔记.md', content: '未完成的输入😀\r\n', expectedSignature: 'source', revision: 7, updated: 1 } }, fileImports: { [id]: entry } }
const report = { kind: 'text-import-read-retry', baseline, nativeAndroidTest: false, checks: [], observed: {}, screens: [], errors: [], externalRequests: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let page
const button = name => page.getByRole('button', { name, exact: true })
const back = () => page.evaluate(() => window.__longeditMobileBack())
const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
const idle = () => page.waitForFunction(() => !document.querySelector('.file-import-panel [role=status]')?.textContent?.includes('正在'))
const open = async () => { await button('添加资料').tap(); await button('导入文本文件').tap(); await page.getByRole('dialog', { name: '文件导入', exact: true }).waitFor(); await idle() }
const failure = '读取暂时失败，请稍后重试。'
async function shot(name) {
  const confirming = await page.getByRole('alertdialog').isVisible(), top = confirming ? 0 : Math.max(0, Math.floor(Math.min((await page.locator('.preview-ribbon').boundingBox())?.height || 0, (await page.locator('.bottom-sheet').boundingBox()).y))), viewport = page.viewportSize()
  await page.screenshot({ path: output + '/' + name + '.png', clip: { x: 0, y: top, width: viewport.width, height: viewport.height - top } })
  report.screens.push({ name, viewport, top })
  const geometry = await page.locator('.bottom-sheet').evaluate((root, top) => [...root.querySelectorAll('h2,h3,p,button,textarea')].filter(e => e.checkVisibility() && !e.closest('[inert]')).map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { tag: e.tagName, name: e.getAttribute('aria-label') || e.textContent.trim(), x: r.x, y: r.y - top, width: r.width, height: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, color: s.color, fontFamily: s.fontFamily } }), top)
  await writeFile(output + '/' + name + '-geometry.json', JSON.stringify(geometry, null, 2))
  if (baseline) {
    const html = await page.evaluate(() => { const root = document.documentElement.cloneNode(true); root.querySelectorAll('textarea').forEach((e, i) => { e.textContent = document.querySelectorAll('textarea')[i].value }); root.querySelectorAll('script,link[rel=modulepreload]').forEach(e => e.remove()); root.querySelectorAll('link[rel=stylesheet]').forEach(e => e.setAttribute('href', 'app.css')); return '<!doctype html>' + root.outerHTML })
    await writeFile(output + '/' + name + '.html', html)
  }
}
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const result = await page.evaluate(async () => { const r = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return { violations: r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), incomplete: r.incomplete.map(v => ({ id:v.id, nodes:v.nodes.map(n => ({ targets:n.target, summary:n.failureSummary, colors:n.target.map(t=>{const e=document.querySelector(t),s=e&&getComputedStyle(e);let p=e,bg='';while(p){const style=getComputedStyle(p);if(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!=='transparent'){bg=style.backgroundColor;break}p=p.parentElement}return s?{foreground:s.color,background:bg,fontSize:s.fontSize,fontWeight:s.fontWeight,opacity:s.opacity}:null}) })) })) } })
  ;(report.accessibility ||= []).push({ name, ...result }); assert.deepEqual(result.violations, [])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(({ key, seed, failure }) => {
    if (window !== window.top) return
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed))
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (k) {
      const stack = new Error().stack || ''
      if (k === key && ((window.__listFail && /\.fileImports\s*\(/.test(stack)) || (window.__recordFail && /\.fileImport\s*\(/.test(stack)))) throw new Error(failure)
      return get.call(this, k)
    }
  }, { key, seed, failure })
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== '127.0.0.1') report.externalRequests.push(r.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await button('添加资料').waitFor(); await page.evaluate(() => { window.__listFail = true }); await open()
  await page.getByRole('alert').filter({ hasText: failure }).waitFor(); await shot('initial-failure')
  report.observed.falseEmpty = await page.getByText('暂无导入记录。', { exact: true }).isVisible()
  if (!baseline) { assert.equal(report.observed.falseEmpty, false); assert.deepEqual(await data(), seed) }
  await page.evaluate(() => { window.__listFail = false }); await button(baseline ? '刷新记录' : '重新读取记录').tap(); await idle()
  const row = page.locator(`[data-file-import-id="${id}"]`); await row.waitFor(); await shot('list-recovered')
  report.observed.staleErrorAfterSuccess = await page.getByRole('alert').filter({ hasText: failure }).isVisible()
  if (!baseline) { assert.equal(report.observed.staleErrorAfterSuccess, false); assert.deepEqual(await data(), seed); report.checks.push('First list read failure is distinct from empty; retry clears the failure and reads existing records without writes') }
  await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle()
  await page.getByRole('heading', { name: entry.name, exact: true }).waitFor(); await shot('detail-failure')
  report.observed.inlineRetry = await button('重新读取这条记录').isVisible()
  assert.equal(await button('存入手机资料库并打开').count(), 0)
  await page.evaluate(() => { window.__recordFail = false })
  if (baseline) { await back(); await idle(); await row.tap(); await idle() }
  else { assert.equal(report.observed.inlineRetry, true); await button('重新读取这条记录').tap(); await idle() }
  await button('存入手机资料库并打开').waitFor(); await shot('detail-recovered')
  assert.equal(await readTextImportPreview(page), content.replace(/\r\n|\r/g, '\n'))
  assert.deepEqual(await data(), seed)
  if (!baseline) {
    report.checks.push('A failed record read retries the same ID in place; verified full text is shown before any explicit commit, with original sources and drafts unchanged')
    await scan('recovered detail')
    // A failed refresh must retain the previous list and must recover on retry.
    await back(); await idle(); await page.evaluate(() => { window.__listFail = true }); await button('刷新记录').tap(); await idle()
    await row.waitFor(); assert.equal(await page.getByText('暂无导入记录。', { exact: true }).isVisible(), false); await shot('cached-failure')
    await scan('cached failure'); await page.evaluate(() => { window.__listFail = false }); await button('重新读取记录').tap(); await idle()
    assert.equal(await page.getByRole('alert').filter({ hasText: failure }).count(), 0)
    report.checks.push('Failed refresh retains the last successful list with an explicit stale-data status; subsequent retry clears only the list error')
    // Browser cancel-event check only, not a system picker cancellation test.
    const before = await data(); await page.getByLabel('选择导入文件', { exact: true }).dispatchEvent('cancel'); assert.deepEqual(await data(), before)
    // Repeated read failures and removal cancellation preserve record identity.
    await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle(); await button('重新读取这条记录').tap(); await idle()
    await button('移除记录').tap(); await page.getByText('记录内容暂时无法读取。移除后，其中可能尚未存入笔记的文字也会移除。源文件和已存入的笔记不会删除。', { exact: true }).waitFor(); await shot('read-failure-confirm'); await back(); await button('重新读取这条记录').waitFor(); assert.deepEqual(await data(), seed)
    await scan('failed detail'); await shot('detail-repeat-failure')
    await page.evaluate(() => { window.__recordFail = false }); await button('重新读取这条记录').tap(); await idle(); await back(); await idle(); await back()
    await button('切换深色').tap(); await open(); await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle(); await shot('dark-detail-failure')
    await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' }); await scan('320px 200% dark failure')
    await button('重新读取这条记录').scrollIntoViewIfNeeded(); await shot('narrow-detail-failure')
    for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog],[role=alertdialog]') && !document.activeElement?.closest('[inert]')), true) }
    report.checks.push('Repeated read failures, cancellation of removal, narrow dark 200% text and modal focus containment preserve the same pending record')
    await page.setViewportSize({ width: 390, height: 872 }); await page.evaluate(() => { document.documentElement.style.fontSize = '16px'; window.__recordFail = false }); await button('重新读取这条记录').tap(); await idle()
    await button('存入手机资料库并打开').tap(); await page.locator('.reader-header h1').waitFor()
    const final = await data(), imported = final.fileImports[id]
    assert.equal(imported.status, 'imported'); assert.equal(final.documents[JSON.stringify(['local', imported.localPath])].content, content); assert.deepEqual(final.drafts, seed.drafts); assert.deepEqual(final.documents[docKey], seed.documents[docKey]); assert.equal(Object.keys(final.fileImports).length, 1)
    report.checks.push('After recovery the explicit commit imports exact original text once and leaves the existing source and unsaved draft intact')
    await button('返回资料库').tap()
    await page.evaluate(({ key, created }) => {
      const d = JSON.parse(localStorage.getItem(key))
      for (let i = 0; i < 31; i++) d.fileImports['older-' + i] = { id: 'older-' + i, name: `旧记录 ${i}.txt`, created: created + i + 1, bytes: 0, status: 'failed', readable: false, content: null, digest: null, error: '上次选择的文件格式不支持。', localPath: null }
      localStorage.setItem(key, JSON.stringify(d))
    }, { key, created: entry.created })
    await open(); await button('显示更多记录').tap(); await row.scrollIntoViewIfNeeded(); await row.focus()
    const historyTop = await page.locator('.file-import-body').evaluate(e => e.scrollTop), deepBefore = await data()
    await page.evaluate(() => { window.__recordFail = true }); await row.tap(); await idle()
    await page.evaluate(() => { window.__recordFail = false }); await button('重新读取这条记录').tap(); await idle(); await back(); await idle()
    assert.equal(await row.evaluate(e => e === document.activeElement), true)
    assert.ok(Math.abs(await page.locator('.file-import-body').evaluate(e => e.scrollTop) - historyTop) <= 2)
    assert.deepEqual(await data(), deepBefore)
    await page.locator('[data-file-import-id="older-0"]').tap(); await idle()
    assert.equal(await button('重新读取这条记录').count(), 0)
    await back(); await idle()
    report.checks.push('Read retry preserves a deep history batch, selected record focus and scroll; persisted format failures are not presented as temporary read failures')
    // A staged receipt must also remain available if reading its detail fails.
    await page.evaluate(() => { window.__recordFail = true })
    await page.getByLabel('选择导入文件', { exact: true }).setInputFiles({ name: '新收到.txt', mimeType: 'text/plain', buffer: Buffer.from(content) }); await idle()
    await button('重新读取这条记录').waitFor()
    const stagedData = await data(), staged = Object.values(stagedData.fileImports).find(e => e.name === '新收到.txt')
    assert.ok(staged); assert.equal(staged.content, content); assert.equal(Object.keys(stagedData.documents).length, Object.keys(deepBefore.documents).length)
    await page.evaluate(() => { window.__recordFail = false }); await button('重新读取这条记录').tap(); await idle()
    assert.deepEqual(await data(), stagedData)
    assert.equal(await readTextImportPreview(page), content.replace(/\r\n|\r/g, '\n'))
    report.checks.push('Failure to read a just-staged receipt retains the same new ID and complete text; in-place retry does not stage or import a duplicate')
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  }
  const css = await page.locator('link[rel=stylesheet]').first().getAttribute('href'); await writeFile(output + '/app.css', await (await page.request.get(new URL(css, page.url()).href)).body())
} catch (e) { report.failure = String(e.stack || e); process.exitCode = 1; if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {}) }
finally { await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, observed: report.observed, checks: report.checks.length, failure: report.failure }, null, 2)) }
