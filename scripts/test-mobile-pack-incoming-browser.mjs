import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const fixture = process.env.LONGEDIT_PACK_IMPORT_FIXTURE || 'E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024'
const archive = await readFile(path.join(fixture, 'safe.textpack')), manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'))
const output = `docs/evidence/mobile-0.1.0/pack-incoming-browser-${Date.now()}`; await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true }), report = { kind: 'system-pack-review-user-tasks', nativeAndroidTest: false, transport: 'Synthetic preview receiver contract; Android delivery and grants tested separately', checks: [], errors: [], externalRequests: [] }
const key = JSON.stringify(['local','在写.md']), candidate = '正在写的中文😀\r\n完整尾行\r\n'
let page, created = Date.now()
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const close = () => page.getByRole('button', { name: '关闭面板', exact: true }).tap()
const view = () => page.getByRole('button', { name: '查看收到的内容', exact: true }).tap()
async function replaceEditorText(text) {
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true })
  await editor.press('Control+A'); await page.keyboard.insertText(text)
  assert.equal((await editor.locator('.cm-line').allTextContents()).join('\n'), text.replace(/\r\n|\r/g,'\n'), 'Input setup replaces the current document before testing intake')
}
async function receive(kind, name, failed = false) {
  return page.evaluate(({ kind, name, failed, created, archive, digest, content, textDigest }) => {
    const d = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')), id = crypto.randomUUID()
    const base = { id, name, created, bytes: 947, status: failed ? 'failed' : 'ready', readable: true, error: failed ? '附件包压缩内容损坏，请重新导出。' : '', localPath: null, incoming: true, source: 'share-file' }
    if (kind === 'pack') (d.packImports ||= {})[id] = { ...base, count: 3, textName: 'text.markdown', assets: [], content: null, archive, archiveDigest: digest }
    else (d.fileImports ||= {})[id] = { ...base, bytes: new TextEncoder().encode(content).length, content, digest: textDigest }
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(d)); window.dispatchEvent(new Event('longedit-mobile-incoming')); return id
  }, { kind, name, failed, created: ++created, archive: archive.toString('base64'), digest: createHash('sha256').update(archive).digest('hex'), content: '混合队列的原文字\r\n', textDigest: createHash('sha256').update('混合队列的原文字\r\n').digest('hex') })
}
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await context.addInitScript(({ key }) => {
    if (window !== window.top) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [key]: { rootId: 'local', relativePath: '在写.md', content: '原文件\r\n', signature: 'old', modified: 1 } }, drafts: {} }))
    const store = Storage.prototype.setItem
    Storage.prototype.setItem = function(k, v) {
      if (k === 'longedit-mobile-preview-v1') {
        const d = JSON.parse(v), before = JSON.parse(localStorage.getItem(k) || '{}')
        if (window.__rejectDraft && d.drafts[key]?.content.includes('保护失败')) throw new DOMException('草稿空间不足', 'QuotaExceededError')
        if (window.__rejectPackAck && before.packImports?.[window.__rejectPackAck]?.incoming && !d.packImports?.[window.__rejectPackAck]?.incoming) throw new DOMException('回执空间不足', 'QuotaExceededError')
      }
      return store.call(this, k, v)
    }
  }, { key })
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== '127.0.0.1') report.externalRequests.push(r.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.file-row').filter({ hasText: '在写.md' }).tap(); await page.getByRole('button', { name: '编辑', exact: true }).tap(); await replaceEditorText(candidate)
  const first = await receive('pack', '外部分享.textpack')
  await page.getByText('收到 1 项内容，等待核对', { exact: false }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '笔记正文')
  assert.equal((await data()).documents[key].content, '原文件\r\n'); await page.screenshot({ path: path.join(output, '360-editor-arrival.png') })
  report.checks.push('Receiving a package preserves the active editor, focus and source file and only offers an actionable notice')
  await page.evaluate(() => { window.__rejectDraft = true }); await replaceEditorText(candidate + '保护失败\r\n'); await view()
  await page.getByRole('alert').getByText(/存储空间不足/).waitFor(); assert.equal((await data()).packImports[first].incoming, true); assert.equal(await page.getByRole('dialog').count(), 0)
  await page.evaluate(() => { window.__rejectDraft = false }); await view(); await page.getByLabel('待导入正文（只读）', { exact: true }).waitFor()
  assert.equal((await data()).drafts[key].content, candidate + '保护失败\r\n'); assert.equal((await data()).packImports[first].incoming, false)
  assert.equal(Object.keys((await data()).documents).length, 1); assert.equal(await page.getByLabel('待导入正文（只读）', { exact: true }).inputValue(), manifest.expected.content.replace(/\r\n|\r/g, '\n'))
  await page.getByRole('button', { name: '查看包内图片 图 #.png', exact: true }).tap(); assert.equal(await page.getByAltText('包内图片：assets/图 #.png', { exact: true }).evaluate(img => img.complete && img.naturalWidth), 1)
  report.checks.push('Failed draft protection blocks review and acknowledgement; retry protects the exact draft before opening the complete package and decoding its image, without publishing a note')
  const second = await receive('pack', '稍后核对.textpack'), text = await receive('text', '刚收到.txt')
  assert.equal(await page.getByRole('heading', { name: '外部分享.textpack', exact: true }).count(), 1); assert.equal((await data()).packImports[second].incoming, true)
  await close(); await page.reload(); await view(); await page.getByRole('heading', { name: '刚收到.txt', exact: true }).waitFor()
  assert.equal((await data()).fileImports[text].incoming, false); assert.equal((await data()).packImports[second].incoming, true)
  await close(); await view(); await page.getByRole('heading', { name: '稍后核对.textpack', exact: true }).waitFor()
  assert.equal((await data()).packImports[second].incoming, false)
  report.checks.push('Mixed text and package arrivals survive reload, route by newest delivery across both kinds, and never replace a review already in progress')
  await page.getByRole('button', { name: '将笔记和附件存入手机资料库', exact: true }).tap(); await page.locator('.reader-header h1').waitFor()
  let d = await data(), stored = d.packImports[second], noteKey = JSON.stringify(['local', stored.localPath]), folder = stored.localPath.split('/').slice(0, -1).join('/')
  assert.equal(d.documents[noteKey].content, manifest.expected.content)
  for (const [asset, expected] of Object.entries(manifest.expected.assets)) assert.equal(d.attachments[JSON.stringify(['local', folder + '/' + asset])].base64, expected.base64)
  assert.equal(d.documents[key].content, '原文件\r\n'); assert.equal(d.drafts[key].content, candidate + '保护失败\r\n')
  report.checks.push('Confirming the received package publishes one independent note and every exact attachment while preserving the earlier note and draft')
  const broken = await receive('pack', '损坏.textpack', true); await view(); await page.getByRole('heading', { name: '损坏.textpack', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '将笔记和附件存入手机资料库', exact: true }).count(), 0); assert.equal((await data()).packImports[broken].incoming, false)
  await page.getByRole('button', { name: '移除这份导入记录', exact: true }).tap(); await page.getByRole('button', { name: '确认移除导入记录', exact: true }).tap(); assert.equal((await data()).packImports[broken], undefined)
  report.checks.push('A failed received package is reviewable and removable with an explanation and cannot publish a partial note')
  await close(); const retry = await receive('pack', '回执重试.textpack'); await page.evaluate(id => { window.__rejectPackAck = id }, retry); await view()
  await page.getByRole('dialog').getByRole('alert').getByText(/存储空间不足/).waitFor(); assert.equal((await data()).packImports[retry].incoming, true)
  await page.evaluate(() => { window.__rejectPackAck = '' }); await close(); await view(); await page.getByRole('heading', { name: '回执重试.textpack', exact: true }).waitFor(); assert.equal((await data()).packImports[retry].incoming, false)
  report.checks.push('An acknowledgement write failure keeps the package unread and retained; explicitly retrying review clears only its notice')
  await close(); const last = await receive('pack', '连同接收说明.textpack')
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); d.incomingError = '没有收到文件的读取授权，请重新分享。'; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(d)); window.dispatchEvent(new Event('longedit-mobile-incoming')) })
  await view(); await page.getByRole('heading', { name: '连同接收说明.textpack', exact: true }).waitFor(); await page.getByRole('alert').getByText('没有收到文件的读取授权，请重新分享。', { exact: true }).waitFor()
  assert.equal((await data()).incomingError, undefined); assert.equal((await data()).packImports[last].incoming, false)
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px' }); await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const accessibility = await page.evaluate(async () => (await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })).violations.map(({ id }) => id))
  assert.deepEqual(accessibility, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), true) }
  await page.screenshot({ path: path.join(output, '360-review-error-200.png'), fullPage: true }); await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
  report.checks.push('A durable rejection explanation remains visible alongside a valid package; 360px dark mode with 200% text and modal keyboard focus passes checked accessibility rules')
  await close(); await page.reload(); assert.equal(await page.getByRole('button', { name: '查看收到的内容', exact: true }).count(), 0)
  await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '附件包导入记录')
  assert.equal(await page.getByLabel('待导入正文（只读）', { exact: true }).count(), 0); await page.locator(`[data-pack-import-id="${second}"]`).tap(); await page.getByRole('button', { name: '打开已导入笔记', exact: true }).tap(); await page.locator('.reader-header h1').waitFor()
  d = await data(); assert.equal(d.documents[noteKey].content, manifest.expected.content); assert.equal(d.drafts[key].content, candidate + '保护失败\r\n')
  report.checks.push('Closing a received review clears its initial routing state; Settings opens the history and completed entries reopen the existing note without creating duplicates')
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); d.incomingError = '已保留 6 份导入附件包，请先移除不需要的导入记录。'; d.incomingErrorKind = 'pack'; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(d)); window.dispatchEvent(new Event('longedit-mobile-incoming')) })
  await view(); await page.getByRole('dialog', { name: '导入笔记与附件', exact: true }).waitFor(); await page.getByRole('alert').getByText(/已保留 6 份导入附件包/).waitFor()
  assert.equal(await page.getByRole('heading', { name: '附件包导入记录', exact: true }).count(), 1); assert.equal((await data()).incomingErrorKind, undefined); assert.equal((await data()).incomingError, undefined)
  report.checks.push('A package-only rejection with no unread item opens package history and its explanation so users can manage retained packages; clearing the error also clears its routing kind')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, checks: report.checks.length, passed: report.passed, failure: report.failure }, null, 2)) }
