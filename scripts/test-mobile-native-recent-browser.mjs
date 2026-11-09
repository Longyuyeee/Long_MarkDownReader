import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/native-recent-browser-${Date.now()}`
await mkdir(output); await writeFile(output + '/.gitignore', '*\n')
const recentKey = 'longedit-mobile-recent-v1', previewKey = 'longedit-mobile-preview-v1'
const target = { rootId: 'local', relativePath: '未保存入口.md' }, other = { rootId: 'local', relativePath: '另一份草稿.md' }
const key = identity => JSON.stringify([identity.rootId, identity.relativePath])
const content = '正在核对手机接收😀\n先保留这段未保存输入\n返回后继续写'
const fixture = { version: 1, documents: { [key({ rootId: 'local', relativePath: '已保存.md' })]: { rootId: 'local', relativePath: '已保存.md', content: '# 原文件\n', signature: 'source-original', modified: 1 } }, drafts: {
  [key(target)]: { ...target, content, expectedSignature: null, revision: 7, updated: 30 },
  [key(other)]: { ...other, content: '保留另一份未完成输入', expectedSignature: null, revision: 3, updated: 10 }
} }
const report = { scope: 'Production browser adapter and full MobileApp; not native IPC or WebView-profile verification', nativeAndroidTest: false, checks: [], scans: [], manualContrastReviews: [], errors: [], passed: false }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let context, page
const button = name => page.getByRole('button', { name, exact: true })
async function start(recent) {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(({ fixture, previewKey, recentKey, recent }) => {
    if (window !== window.top || localStorage.getItem(previewKey)) return
    localStorage.setItem(previewKey, JSON.stringify(fixture))
    if (recent !== undefined) localStorage.setItem(recentKey, recent)
  }, { fixture, previewKey, recentKey, recent })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto('http://127.0.0.1:9012/mobile.html')
  await page.getByRole('heading', { name: '我的资料', exact: true }).waitFor()
}
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const result = await page.evaluate(() => axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
  report.scans.push({ name, violations: result.violations, incomplete: result.incomplete })
  assert.equal(result.violations.length, 0, name)
  for (const issue of result.incomplete) {
    assert.equal(issue.id, 'color-contrast')
    for (const node of issue.nodes) {
      const selector = node.target[0]
      assert.match(selector, /^button\[data-library-view="(?:library|recent)"\] > span$/)
      const review = await page.locator(selector).evaluate(span => {
        const button = span.parentElement, text = getComputedStyle(span), paint = getComputedStyle(button, '::before')
        const colors = value => value.match(/[\d.]+/g).map(Number)
        const luminance = value => colors(value).slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
        const foreground = text.color, background = paint.backgroundColor, a = luminance(foreground), b = luminance(background)
        const rect = span.getBoundingClientRect(), top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return { text: span.textContent, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), pseudoOpacity: paint.opacity, pseudoContent: paint.content, selected: button.getAttribute('aria-pressed'), unobscured: top === button || top === span || span.contains(top) }
      })
      assert.equal(review.selected, 'true'); assert.equal(review.pseudoOpacity, '1')
      assert.notEqual(review.background, 'rgba(0, 0, 0, 0)'); assert.ok(review.ratio >= 4.5); assert.equal(review.unobscured, true)
      report.manualContrastReviews.push({ name, selector, ...review, scope: 'Selected tab pseudo-background only; original axe incomplete retained' })
    }
  }
}
try {
  await start()
  await page.locator('.continue-card').filter({ hasText: target.relativePath }).waitFor()
  await page.screenshot({ path: output + '/recovered-entry.png' }); await scan('recovered-entry')
  await page.locator('.continue-card').tap()
  await page.getByRole('region', { name: '发现恢复草稿', exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: '笔记正文', exact: true }).count(), 0)
  await page.screenshot({ path: output + '/recovery-decision.png' })
  await button('继续这份草稿').tap()
  const editor = page.getByRole('textbox', { name: '笔记正文', exact: true })
  assert.equal(await editor.innerText(), content)
  await page.waitForFunction(() => document.querySelector('.cm-content') === document.activeElement)
  const data = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), previewKey)
  assert.deepEqual(data.documents, fixture.documents); assert.deepEqual(data.drafts[key(other)], fixture.drafts[key(other)])
  assert.equal(data.drafts[key(target)].content, content)
  assert.deepEqual(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), recentKey), [target, other])
  await page.screenshot({ path: output + '/continued-draft.png' })
  await page.reload(); await page.locator('.continue-card').filter({ hasText: target.relativePath }).waitFor()
  assert.deepEqual((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), previewKey)).documents, fixture.documents)
  report.checks.push('Missing recent metadata restores the newest draft identity; continuation still requires the existing recovery decision and keeps exact content, editor focus, other draft and source files; reload retains the entry')

  await start(JSON.stringify([{ rootId: 'local', relativePath: '已保存.md' }]))
  await page.locator('.continue-card').filter({ hasText: '已保存.md' }).waitFor()
  assert.equal(await page.locator('.continue-card').filter({ hasText: target.relativePath }).count(), 0)
  await start('[]'); await button('最近').tap(); await page.getByRole('heading', { name: '暂无最近记录', exact: true }).waitFor()
  assert.equal(await page.locator('.continue-card').count(), 0)
  report.checks.push('An existing recent list stays authoritative; an explicit empty list stays empty even when private preview drafts exist')

  await start('{broken-json'); await button('最近').tap()
  await page.getByRole('heading', { name: '最近记录暂不可用', exact: true }).waitFor()
  assert.equal(await page.getByText('暂无最近记录', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(k => localStorage.getItem(k), recentKey), '{broken-json')
  await page.screenshot({ path: output + '/unreadable-recent.png' }); await scan('unreadable-recent')
  await page.evaluate(k => localStorage.setItem(k, '[]'), recentKey); await button('重新读取').tap()
  await page.getByRole('heading', { name: '暂无最近记录', exact: true }).waitFor()
  report.checks.push('Malformed metadata is preserved and shown as unreadable rather than empty; explicit retry reads the repaired record')

  await start(JSON.stringify([{ rootId: 'local', relativePath: '已保存.md' }]))
  await page.locator('.continue-card').waitFor(); await button('最近').tap()
  await page.evaluate(k => {
    const original = Storage.prototype.getItem
    window.__recentFault = true
    Storage.prototype.getItem = function (name) { if (window.__recentFault && name === k) throw Error('Synthetic recent read failure'); return original.call(this, name) }
  }, recentKey)
  await button('刷新最近记录').tap()
  await page.getByText('最近记录暂时无法读取，原记录仍保留。', { exact: true }).waitFor()
  await page.locator('.file-row').filter({ hasText: '已保存.md' }).waitFor()
  assert.equal(await page.getByText('暂无最近记录', { exact: true }).count(), 0)
  await page.screenshot({ path: output + '/failed-refresh-keeps-list.png' })
  await page.evaluate(() => { window.__recentFault = false }); await button('刷新最近记录').tap()
  await page.getByText('1 项', { exact: true }).waitFor()
  report.checks.push('Refresh failure keeps the previously loaded rows reachable; retry clears the failure without changing their identity')
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) {
  report.failure = String(error.stack || error); process.exitCode = 1
  if (page) await page.screenshot({ path: output + '/failure.png' }).catch(() => {})
} finally {
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n')
  await browser.close(); console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, failure: report.failure }))
}
