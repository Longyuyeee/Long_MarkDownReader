import { openMobileDocumentAction } from './mobile-document-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/reading-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'browser-preview-reading-fixtures', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const identity = { rootId: 'local', relativePath: '阅读/移动阅读.md' }, key = JSON.stringify(['local', '阅读/移动阅读.md'])
const content = '# 移动阅读验收\n\n![资料库示意图](../附件/示意%20图.png)\n\n![丢失图片](missing.png)\n\n![外部图片](https://example.invalid/private.png)\n\n阅读**重点**在这里，重点[ ]与重点[ ]都可以找到。Alpha alpha。\n\n' + Array.from({ length: 70 }, (_, i) => `## 第 ${i + 1} 节\n\n中文阅读段落 ${i + 1}，换个方向也能接着阅读。这些内容用于核对位置恢复。\n`).join('\n') + '\n<script>parent.__mobilePwned=true</script><img src="https://example.invalid/leak.png" onerror="parent.__mobilePwned=true"><iframe src="https://example.invalid/frame"></iframe><svg onload="parent.__mobilePwned=true"></svg>'
const png = await readFile(new URL('../src-tauri/icons/128x128.png', import.meta.url))
let page
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(({ key, identity, content, image }) => {
    if (window !== window.top || localStorage.getItem('longedit-reading-fixture-ready')) return
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [key]: { ...identity, content, signature: 'fixture-original', modified: 1 } }, drafts: {}, images: { [JSON.stringify(['local', '附件/示意 图.png'])]: image } }))
    localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([identity])); localStorage.setItem('longedit-reading-fixture-ready', 'true')
  }, { key, identity, content, image: { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: 128, height: 128, bytes: png.length } })
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.continue-card').tap()
  const frame = page.frameLocator('iframe[title="文档阅读"]')
  await frame.getByRole('heading', { name: '移动阅读验收', exact: true }).waitFor()
  await frame.locator('img[alt="资料库示意图"]').waitFor()
  assert.equal(await frame.locator('img[alt="资料库示意图"]').evaluate(image => image.complete && image.naturalWidth), 128)
  await frame.getByText(/图片未加载：图片已移动或不存在/).waitFor()
  assert.equal(await frame.locator('img[src^="http"]').count(), 0)
  await page.screenshot({ path: path.join(output, '360-images.png') })
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); data.images[JSON.stringify(['local', '阅读/missing.png'])] = Object.values(data.images)[0]; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(data)) })
  await page.getByRole('button', { name: '重试图片', exact: true }).tap()
  await frame.locator('img[alt="丢失图片"]').waitFor()
  assert.equal(await frame.locator('img[alt="丢失图片"]').evaluate(image => image.complete && image.naturalWidth), 128)
  report.checks.push('Relative percent-encoded parent-folder PNG loads; missing/external images show placeholders without network access; retry loads a recovered attachment')
  await openMobileDocumentAction(page, '在文档内查找')
  const input = page.getByRole('textbox', { name: '查找文档内容' })
  await input.fill('重点'); await page.getByRole('status').filter({ hasText: '1 / 3' }).waitFor()
  await page.getByRole('button', { name: '上一处', exact: true }).tap(); await page.getByText('3 / 3', { exact: true }).waitFor()
  await input.fill('阅读重点'); await page.getByText('1 / 1', { exact: true }).waitFor()
  assert.equal(await frame.locator('mark[data-longedit-hit="0"]').count(), 2, 'one match spans text and strong elements')
  await input.fill('[ ]'); await page.getByText('1 / 2', { exact: true }).waitFor()
  await input.fill('ALPHA'); await page.getByText('1 / 2', { exact: true }).waitFor()
  await input.fill('不存在的词'); await page.getByText('未找到', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, '360-search-empty.png') })
  report.checks.push('Rendered text search handles Chinese, inline formatting, literal symbols, case-insensitive Latin, previous/wrap and no matches')
  await page.getByRole('button', { name: '关闭文档查找' }).tap()
  const actualFrame = page.frames().find(candidate => candidate.parentFrame())
  await actualFrame.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * .55))
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('longedit-mobile-reading-v1') || '{}')).some(value => value.progress > .4))
  await page.getByRole('button', { name: '返回资料库' }).tap(); await page.reload(); await page.locator('.continue-card').tap()
  await frame.locator('article').waitFor()
  await page.waitForFunction(() => { const values = Object.values(JSON.parse(localStorage.getItem('longedit-mobile-reading-v1') || '{}')); return values.some(value => value.progress > .4) })
  const resumedFrame = page.frames().find(candidate => candidate.parentFrame()); await resumedFrame.waitForFunction(() => scrollY > 1000)
  assert.ok(await resumedFrame.evaluate(() => scrollY > 1000))
  await page.screenshot({ path: path.join(output, '360-resumed.png') })
  await openMobileDocumentAction(page, '从头阅读')
  assert.equal(await resumedFrame.evaluate(() => scrollY), 0)
  await page.getByRole('button', { name: '返回资料库' }).tap(); await page.locator('.continue-card').tap()
  await frame.getByRole('heading', { name: '移动阅读验收', exact: true }).waitFor()
  assert.equal(await page.frames().find(candidate => candidate.parentFrame()).evaluate(() => scrollY), 0, '从头阅读后重开仍从顶部开始')
  report.checks.push('Reading position survives page reload and document close, with an explicit return-to-start action')
  const security = await page.frames().find(candidate => candidate.parentFrame()).evaluate(() => {
    let parentBlocked = false, storageBlocked = false
    try { void parent.document.body } catch { parentBlocked = true }
    try { localStorage.setItem('escape', 'bad') } catch { storageBlocked = true }
    const script = document.createElement('script'); script.textContent = 'window.__untrustedInline = true'; document.body.append(script); script.remove()
    const button = document.createElement('button'); button.setAttribute('onclick', 'window.__untrustedHandler = true'); document.body.append(button); button.click(); button.remove()
    return { parentBlocked, storageBlocked, inlineBlocked: !window.__untrustedInline, handlerBlocked: !window.__untrustedHandler, scripts: document.scripts.length, frames: document.querySelectorAll('iframe').length, handlers: document.querySelectorAll('[onerror],[onload]').length }
  })
  assert.deepEqual(security, { parentBlocked: true, storageBlocked: true, inlineBlocked: true, handlerBlocked: true, scripts: 1, frames: 0, handlers: 0 })
  assert.equal(await page.evaluate(() => window.__mobilePwned), undefined)
  await page.evaluate(() => window.postMessage({ type: 'matches', count: 999, current: 999, channel: 'forged' }, '*'))
  await openMobileDocumentAction(page, '在文档内查找'); assert.equal(await page.getByRole('button', { name: '下一处', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '关闭文档查找' }).tap()
  report.checks.push('Opaque sandbox blocks parent/storage access; source scripts, handlers and frames removed; CSP blocks untrusted inline scripts and event handlers; foreign-channel messages ignored')
  await page.getByRole('button', { name: '编辑', exact: true }).tap(); await openMobileDocumentAction(page, '在文档内查找')
  await input.fill('重点'); await page.getByText('1 / 3', { exact: true }).waitFor()
  await page.getByRole('button', { name: '下一处', exact: true }).tap(); await page.getByText('2 / 3', { exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.cm-selectionBackground')].some(element => element.getBoundingClientRect().width > 0 && getComputedStyle(element).backgroundColor !== 'transparent'))
  await page.getByRole('button', { name: '关闭文档查找' }).tap()
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents[key].content, key), content)
  await page.setViewportSize({ width: 640, height: 360 })
  const footer = await page.locator('.editor-footer').boundingBox(); assert.ok(footer.y + footer.height <= 361)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, '640-short-editor.png') })
  report.checks.push('Source search selects matches without saving or changing original; short landscape viewport keeps editor actions visible')
  await page.getByRole('button', { name: '返回资料库' }).tap()
  await page.evaluate(key => { const data = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); data.documents[key].content = '# 外部已更新\n\n新的内容。'; data.documents[key].signature = 'external-change'; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(data)) }, key)
  await page.locator('.continue-card').tap(); await page.getByText('内容已有变化，已从头打开。', { exact: true }).waitFor()
  await frame.getByRole('heading', { name: '外部已更新' }).waitFor()
  report.checks.push('Changed document content resets the old reading position with an explanation')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.passed = false; report.failure = String(error); process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
