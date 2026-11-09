import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/new-draft-recovery-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const report = { kind: 'recover-an-unsaved-new-note', nativeAndroidTest: false, checks: [], focusChecks: [], errors: [], alignment: [], scans: [] }
const key = 'longedit-mobile-preview-v1', name = 'AndroidTask-20261029.md', id = JSON.stringify(['local', name]), draft = '正在核对手机接收😀\n先保留这段未保存输入\n返回后继续写'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let page
const button = text => page.getByRole('button', { name: text, exact: true })
const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
async function context(seed) {
  const context = await browser.newContext({ viewport: { width: 393, height: 751 }, isMobile: true, hasTouch: true, colorScheme: 'light' })
  await context.addInitScript(({ key, seed }) => { if (window === window.top && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)) }, { key, seed })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  return context
}
async function scan(state) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const result = await page.evaluate(async () => { const r = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return { violations: r.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })), incomplete: r.incomplete.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })) } })
  report.scans.push({ state, ...result }); assert.deepEqual(result.violations, [], state)
}
const geometry = () => {
  const card = document.querySelector('.recovery-card'), primary = card.querySelector('.primary-button'), header = document.querySelector('.reader-header')
  const a = card.getBoundingClientRect(), b = primary.getBoundingClientRect(), h = header.getBoundingClientRect()
  return { cardWidth: a.width, cardHeight: a.height, cardBelowHeader: a.y - h.bottom, primaryX: b.x - a.x, primaryY: b.y - a.y, primaryWidth: b.width, primaryHeight: b.height }
}
async function compare(state, query = '') {
  const reference = await browser.newPage({ viewport: { width: 393, height: 751 } })
  await reference.goto('http://127.0.0.1:9026/design/mobile-new-draft-recovery-v1/index.html?' + query)
  await reference.getByRole('region', { name: '发现恢复草稿' }).waitFor()
  const expected = await reference.evaluate(geometry), actual = await page.evaluate(geometry)
  const deltas = Object.fromEntries(Object.keys(actual).map(k => [k, actual[k] - expected[k]]))
  report.alignment.push({ state, expected, actual, deltas, note: 'Card-relative geometry; browser preview ribbon and Android system bars are not hidden or edited.' })
  for (const [key, delta] of Object.entries(deltas)) assert.ok(Math.abs(delta) <= 1, state + ' ' + key + ': ' + delta)
  await reference.close()
}
async function checkContinuationFocus(state) {
  const body = page.getByRole('textbox', { name: '笔记正文', exact: true }), before = (await data()).documents[id]
  assert.equal(await body.evaluate(element => document.activeElement === element), true, state + ': continuation must focus the actual editor')
  const marker = 'FocusProbe-20261029'
  await page.keyboard.type(marker)
  assert.equal((await body.innerText()).replace(marker, ''), draft, state + ': typing must preserve the complete restored draft')
  assert.equal((await body.innerText()).split(marker).length, 2)
  await page.waitForFunction(({ key, id, typed }) => JSON.parse(localStorage.getItem(key)).drafts[id]?.content === typed, { key, id, typed: await body.innerText() })
  await page.screenshot({ path: output + '/' + state + '-continued-input.png' })
  await page.keyboard.press('Control+z')
  assert.equal(await body.innerText(), draft, state + ': one undo returns to the restored text')
  await page.waitForFunction(({ key, id, draft }) => JSON.parse(localStorage.getItem(key)).drafts[id]?.content === draft, { key, id, draft })
  assert.deepEqual((await data()).documents[id], before, state + ': focus and typing must not save the source')
  report.focusChecks.push({ state, editorFocused: true, directKeyboardInput: true, undoRestoresCompleteDraft: true, sourceUnchanged: true })
}
try {
  let c = await context({ version: 1, documents: {}, drafts: {} })
  await button('添加资料').tap(); await page.getByRole('dialog', { name: '添加资料', exact: true }).getByRole('button', { name: '新建笔记', exact: true }).tap(); await page.getByLabel('笔记名称', { exact: true }).fill(name); await button('开始记录').tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(draft)
  await page.waitForFunction(({ key, id, draft }) => JSON.parse(localStorage.getItem(key)).drafts[id]?.content === draft, { key, id, draft })
  await page.reload(); await page.locator('.continue-card').tap(); await page.getByText('新笔记草稿还在', { exact: true }).waitFor()
  assert.equal(await button('先阅读文件').count(), 0); assert.equal(await page.locator('.editor-footer').count(), 0)
  assert.equal((await data()).documents[id], undefined); assert.equal((await data()).drafts[id].content, draft)
  await compare('new'); await scan('new'); await page.screenshot({ path: output + '/new.png' })
  await page.emulateMedia({ colorScheme: 'dark' }); await page.locator('.mobile-app.theme-dark').waitFor(); await compare('new-dark', 'dark'); await scan('new-dark'); await page.screenshot({ path: output + '/new-dark.png' })
  await page.setViewportSize({ width: 320, height: 346 }); await page.evaluate(() => document.documentElement.style.fontSize = '32px')
  await button('继续这份草稿').scrollIntoViewIfNeeded(); const bounds = await button('继续这份草稿').boundingBox(); assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 346)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await scan('new-short-large'); await page.screenshot({ path: output + '/new-short-large.png' })
  await button('继续这份草稿').tap(); assert.equal(await page.getByRole('textbox', { name: '笔记正文', exact: true }).innerText(), draft)
  assert.equal((await data()).documents[id], undefined); assert.equal((await data()).drafts[id].content, draft)
  await checkContinuationFocus('new-short-large')
  report.checks.push('A new unsaved note survives reload, offers one truthful continuation, keeps its complete draft and has no saved-file action or duplicate footer; dark/200%/short screens remain operable')
  await c.close()
  for (const changed of [false, true]) {
    const saved = '# 已保存正文\n', signature = changed ? 'externally-created' : 'saved'
    c = await context({ version: 1, documents: { [id]: { rootId: 'local', relativePath: name, content: saved, signature, modified: 1 } }, drafts: { [id]: { rootId: 'local', relativePath: name, content: draft, expectedSignature: changed ? null : signature, revision: 1, updated: 1 } } })
    await page.locator('.file-row').filter({ hasText: name }).tap(); await button('先阅读文件').waitFor()
    assert.equal(await page.getByText('新笔记草稿还在', { exact: true }).count(), 0); assert.equal(await page.locator('.editor-footer').count(), 0)
    if (changed) await page.getByText(/原文件已有变化/).waitFor()
    else { await compare('saved', 'state=saved'); await scan('saved'); await page.screenshot({ path: output + '/saved.png' }) }
    await button('先阅读文件').tap(); await page.frameLocator('iframe').getByText('已保存正文', { exact: true }).waitFor(); await button('继续草稿').tap(); await button('继续这份草稿').waitFor(); await button('继续这份草稿').tap()
    assert.equal(await page.getByRole('textbox', { name: '笔记正文', exact: true }).innerText(), draft); assert.equal((await data()).documents[id].content, saved)
    await checkContinuationFocus(changed ? 'external-source' : 'saved-source')
    report.checks.push(changed ? 'If a real source appeared after creating the draft, it remains readable and the conflict warning stays; source existence is not inferred from the draft signature alone' : 'Existing saved content remains readable, returns to the recovery choice, and restores the original draft without writing the saved file')
    await c.close()
  }
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if (page && !page.isClosed()) await page.screenshot({ path: output + '/failure.png' }).catch(() => {}) }
finally { await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, failure: report.failure })) }
