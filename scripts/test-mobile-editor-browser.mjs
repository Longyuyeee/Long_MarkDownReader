import { readMobileDocument } from './mobile-document-navigation.mjs'
import { openMobileDocumentAction } from './mobile-document-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/editor-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'browser-preview-editor-and-layout', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const original = '# 编辑验收\r\n\r\nAlpha beta\r\n第二段中文\r\n'
let page
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(content => {
    if (window !== window.top || localStorage.getItem('longedit-editor-fixture')) return
    const identity = { rootId: 'local', relativePath: 'Writing.md' }
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [JSON.stringify(['local', 'Writing.md'])]: { ...identity, content, signature: content, modified: 1 } }, drafts: {} }))
    localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([identity])); localStorage.setItem('longedit-editor-fixture', 'true')
  }, original)
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
  const source = async () => (await data()).documents[JSON.stringify(['local', 'Writing.md'])].content
  const draft = async () => Object.values((await data()).drafts)[0]?.content
  const body = () => page.getByLabel('笔记正文', { exact: true })
  async function save() { await page.getByText('草稿已保护', { exact: true }).waitFor(); const expected = await draft(); assert.equal(typeof expected, 'string'); await page.getByRole('button', { name: '保存', exact: true }).tap(); await page.waitForFunction(() => !Object.keys(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).drafts || {}).length); assert.equal(await source(), expected) }
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'); await page.locator('.continue-card').tap(); await page.getByRole('button', { name: '编辑', exact: true }).tap()
  assert.ok(await page.getByRole('button', { name: '撤销', exact: true }).isDisabled()); assert.ok(await page.getByRole('button', { name: '重做', exact: true }).isDisabled())
  await body().press('Control+Home'); await body().press('ArrowDown'); await body().press('ArrowDown'); await body().press('Home'); await body().press('ArrowRight'); await body().press('ArrowRight')
  await page.getByRole('button', { name: '标题', exact: true }).tap(); await page.getByText('草稿已保护', { exact: true }).waitFor()
  assert.ok((await draft()).includes('\r\n## Alpha beta\r\n')); assert.equal(await source(), original)
  await page.getByRole('button', { name: '撤销', exact: true }).tap(); await page.waitForFunction(() => !Object.keys(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).drafts || {}).length); assert.ok(await page.getByRole('button', { name: '重做', exact: true }).isEnabled())
  await page.getByRole('button', { name: '重做', exact: true }).tap(); await page.getByText('草稿已保护', { exact: true }).waitFor()
  report.checks.push('Touch toolbar formats complete lines from a middle caret, keeps CRLF and source unchanged until Save, and exposes real undo/redo availability')

  await page.evaluate(() => { window.__editorBeforeReading = document.querySelector('.cm-editor') })
  await readMobileDocument(page); await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: 'Alpha beta', exact: true }).waitFor()
  assert.ok(await body().isHidden()); await page.getByRole('button', { name: '编辑', exact: true }).tap()
  assert.equal(await page.evaluate(() => window.__editorBeforeReading === document.querySelector('.cm-editor')), true)
  await page.getByRole('button', { name: '撤销', exact: true }).tap(); await page.waitForFunction(() => !Object.keys(JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).drafts || {}).length); assert.ok(await page.getByRole('button', { name: '重做', exact: true }).isEnabled()); assert.equal(await source(), original)
  await page.getByRole('button', { name: '重做', exact: true }).tap(); await save()
  report.checks.push('Reading/editing switch keeps the same editor, selection and undo stack; undo and redo still work after returning and explicit save commits the result')

  await openMobileDocumentAction(page, '在文档内查找'); await page.getByLabel('查找文档内容', { exact: true }).fill('中文')
  await body().press('Control+End')
  const beforeComposition = await source(), cdp = await context.newCDPSession(page)
  await cdp.send('Input.imeSetComposition', { text: 'zhongwen', selectionStart: 8, selectionEnd: 8 })
  await page.waitForTimeout(600); assert.ok((await draft()).endsWith('zhongwen'))
  await cdp.send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 })
  await page.waitForTimeout(600); assert.ok((await draft()).endsWith('中文')); assert.ok(!(await draft()).includes('zhongwen')); assert.equal(await source(), beforeComposition)
  await cdp.send('Input.insertText', { text: '中文，🙂' }); await body().press('Enter'); await cdp.send('Input.insertText', { text: '继续写作' })
  await page.getByText('草稿已保护', { exact: true }).waitFor(); const composed = await draft()
  assert.equal(composed, beforeComposition + '中文，🙂\r\n继续写作'); await save(); assert.equal(await source(), composed)
  await page.getByRole('button', { name: '关闭文档查找', exact: true }).tap()
  report.checks.push('Chromium synthetic IME with active document search protects preedit, replaces pinyin by Chinese without duplication, commits punctuation/emoji/newline, and saves exact CRLF text; not a physical keyboard claim')

  await body().press('Control+End'); await page.getByRole('button', { name: '加粗', exact: true }).tap()
  assert.equal(await page.evaluate(() => window.getSelection()?.toString()), '文字')
  await page.keyboard.insertText('选区替换'); await page.getByText('草稿已保护', { exact: true }).waitFor(); assert.ok((await draft()).endsWith('**选区替换**'))
  report.checks.push('Empty bold action selects its placeholder so ordinary input replaces it, and touch selection is retained by the editing command')

  const sizes = [[360, 800, 1], [360, 800, 2], [800, 360, 1], [800, 360, 2], [640, 260, 2]]
  for (const [width, height, scale] of sizes) {
    await page.setViewportSize({ width, height }); await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale * 16}px` }, scale)
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height } }
      return { width: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth, editor: rect('.mobile-code-editor'), footer: rect('.editor-footer'), header: rect('.reader-header'), textSize: getComputedStyle(document.querySelector('.cm-editor')).fontSize }
    })
    assert.equal(layout.overflow, false); assert.ok(layout.editor.height >= 60, JSON.stringify(layout)); assert.equal(layout.textSize, `${16 * scale}px`)
    await page.getByRole('button', { name: '文档操作', exact: true }).tap(); const read = page.getByRole('button', { name: '阅读文稿', exact: true }); await read.scrollIntoViewIfNeeded(); const box = await read.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height); await page.getByRole('button', { name: '关闭面板', exact: true }).tap(); await body().focus()
    await page.screenshot({ path: path.join(output, `${width}-${height}-font-${scale}.png`) })
  }
  report.checks.push('360px portrait, landscape, short keyboard viewport and 200% relative font layouts keep a usable editor, readable scaled text and reachable Reading action without horizontal page overflow')
  await page.setViewportSize({ width: 860, height: 127 })
  await page.waitForTimeout(250)
  const extreme = await page.evaluate(() => {
    const editor = document.querySelector('.mobile-code-editor').getBoundingClientRect(), header = document.querySelector('.reader-header').getBoundingClientRect()
    return { editor: { top: editor.top, bottom: editor.bottom, height: editor.height }, headerBottom: header.bottom }
  })
  assert.ok(extreme.editor.height >= 46 && extreme.editor.top >= extreme.headerBottom && extreme.editor.bottom <= 127, JSON.stringify(extreme))
  const caret = await page.locator('.cm-cursor').first().boundingBox(); assert.ok(caret && caret.y >= extreme.editor.top && caret.y + caret.height <= extreme.editor.bottom + 2, 'Latest caret must stay visible after viewport shrink')
  assert.ok(await page.getByRole('button', { name: '阅读', exact: true }).isHidden())
  await page.getByRole('button', { name: '文档操作', exact: true }).tap()
  await page.getByRole('button', { name: '阅读文稿', exact: true }).tap(); await page.frameLocator('iframe[title="文档阅读"]').locator('article').waitFor()
  await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '编辑文档', exact: true }).tap(); await body().waitFor()
  await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('dialog').getByRole('button', { name: '撤销', exact: true }).tap(); await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => !document.querySelector('.cm-content')?.textContent.includes('选区替换'))
  await page.screenshot({ path: path.join(output, '860-127-font-2-compact.png') })
  report.checks.push('127px usable height with 200% text preserves at least one editing line, moves reading/formatting to the header menu, and keeps undo plus reading/editing round-trip functional')
  await page.setViewportSize({ width: 360, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '16px' }); await readMobileDocument(page)
  const text = page.frameLocator('iframe[title="文档阅读"]').locator('article')
  await text.waitFor(); assert.ok((await text.innerText()).includes('中文，🙂'))
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.passed = false; report.failure = String(error.stack || error); await page?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); throw error }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
