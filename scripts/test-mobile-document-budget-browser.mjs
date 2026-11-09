import { readMobileDocument } from './mobile-document-navigation.mjs'
import { openMobileDocumentAction } from './mobile-document-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { documentBudgetFixture } from './mobile-document-budget-fixture.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')
const fixture = documentBudgetFixture(), output = `docs/evidence/mobile-0.1.0/document-budget-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const report = { kind: 'browser-document-budget-memory-fixture', nativeAndroidTest: false, bytes: fixture.bytes, fixtureStorage: 'Preview adapter data uses an isolated in-memory Storage override to avoid browser localStorage quota; bookmarks use actual localStorage. Native file bytes are verified separately.', checks: [], errors: [], externalRequests: [], measurements: {} }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let page
async function launch(workerMode = 'actual') {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(({ fixture, workerMode }) => {
    if (window !== window.top) return
    const key = 'longedit-mobile-preview-v1', rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem
    const identity = name => ({ rootId: 'local', relativePath: name })
    let memory = JSON.stringify({ version: 1, documents: Object.fromEntries(Object.entries({ 'Large.md': fixture.content, 'Small.md': fixture.small, 'Dense.md': fixture.dense, 'LongLine.txt': fixture.longLine }).map(([name, content]) => [JSON.stringify(['local', name]), { ...identity(name), content, signature: `fixture-${name}`, modified: 1 }])), drafts: {} })
    Storage.prototype.getItem = function (name) { return this === localStorage && name === key ? memory : rawGet.call(this, name) }
    Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) memory = String(value); else rawSet.call(this, name, value) }
    window.__workers = { made: 0, ended: 0 }
    if (workerMode === 'actual') {
      const Original = window.Worker
      window.Worker = class extends Original { constructor(...args) { super(...args); window.__workers.made++ } terminate() { window.__workers.ended++; super.terminate() } }
    } else {
      window.Worker = class { constructor() { window.__workers.made++ } postMessage() {} terminate() { window.__workers.ended++ } }
    }
  }, { fixture, workerMode })
  page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  return context
}
const open = name => page.locator('.file-row').filter({ has: page.locator('strong', { hasText: name }) }).tap()
const back = () => page.getByRole('button', { name: '返回资料库', exact: true }).tap()
try {
  let context = await launch()
  await open('Small.md')
  await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '普通文稿' }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.__workers), { made: 1, ended: 1 })
  report.checks.push('Ordinary Markdown is parsed in an actual worker, sanitized and rendered; completed worker terminates')
  await back(); await open('Large.md')
  await page.getByRole('region', { name: '分段源码阅读', exact: true }).waitFor()
  let content = page.locator('.source-page-content')
  assert.match(await content.innerText(), /FirstNeedle/)
  const sourceAria = await content.ariaSnapshot()
  assert.match(sourceAria, /FirstNeedle/)
  await writeFile(path.join(output, 'source-page.aria.txt'), sourceAria)
  assert.ok((await content.textContent()).length <= 16384)
  assert.equal(await page.locator('iframe').count(), 0)
  report.measurements = await page.evaluate(() => ({ elements: document.querySelectorAll('*').length, sourcePageCharacters: document.querySelector('.source-page-content').textContent.length, memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize } : null }))
  await page.getByRole('button', { name: '下一段', exact: true }).tap()
  await page.waitForFunction(() => document.activeElement?.classList.contains('source-page-content'))
  await page.locator('.source-jump-opener').tap(); await page.locator('#source-page-number').fill('0'); await page.getByRole('button', { name: '前往', exact: true }).tap()
  await page.getByText(/请输入 1 至/).waitFor(); await page.getByRole('button',{name:'取消',exact:true}).tap()
  await openMobileDocumentAction(page, '在文档内查找')
  const query = page.getByRole('textbox', { name: '查找文档内容' })
  await query.fill('TailNeedle')
  await page.locator('.source-page-content mark').filter({ hasText: 'TailNeedle' }).waitFor()
  assert.match(await content.textContent(), /最后一句，不能丢失。/)
  await page.screenshot({ path: path.join(output, '360-large-tail.png') })
  report.checks.push('Near 4 MiB mixed-ending source mounts one bounded page, validates jumps, focuses appended reading, and whole-source search finds the last line')
  await query.fill('NotFound'); await query.fill('FirstNeedle')
  await page.locator('.source-page-content mark').filter({ hasText: 'FirstNeedle' }).waitFor()
  await query.fill('TailNeedle'); await query.fill(''); await page.getByRole('button', { name: '关闭文档查找' }).tap()
  await page.locator('.source-jump-opener').tap(); await page.locator('#source-page-number').fill('7'); await page.getByRole('button', { name: '前往', exact: true }).tap()
  await back(); await page.locator('.continue-card').tap()
  await page.locator('.source-pager [role=status]').filter({hasText:/^7 \/ \d+$/}).waitFor()
  report.checks.push('Changing or clearing a query cancels old scans; source reading position survives closing and reopening')
  await page.getByRole('button', { name: '编辑', exact: true }).tap()
  const editor = page.getByRole('textbox', { name: '笔记正文' })
  await editor.waitFor()
  assert.ok(await page.locator('.cm-line').count() < 200)
  await editor.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('BudgetSaved')
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByText('已保存到文件', { exact: true }).first().waitFor()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents[JSON.stringify(['local', 'Large.md'])].content)
  assert.equal(saved, 'BudgetSaved' + fixture.content)
  await page.getByRole('button', { name: '撤销', exact: true }).tap()
  await page.getByRole('button', { name: '重做', exact: true }).tap()
  await readMobileDocument(page)
  await content.waitFor(); assert.match(await content.textContent(), /^BudgetSaved/)
  report.checks.push('Large source editing virtualizes lines, saves a single exact prefix with all mixed endings unchanged, and retains undo/redo across reading')
  await back(); await open('Dense.md')
  await content.waitFor(); assert.equal(await page.getByText('文稿排版较密集，已分段显示原文',{exact:true}).count(),0); await page.locator('.source-jump-opener').tap(); assert.ok(await page.getByRole('button',{name:'分段阅读说明',exact:true}).isVisible()); await page.getByRole('button',{name:'取消',exact:true}).tap()
  assert.match(await content.textContent(), /<b>密集<\/b>/)
  assert.equal(await content.locator('b').count(), 0)
  await back(); await open('LongLine.txt')
  await content.waitFor()
  await openMobileDocumentAction(page, '在文档内查找')
  await page.getByRole('textbox', { name: '查找文档内容' }).fill('LongLineEnd')
  await page.locator('.source-page-content mark').filter({ hasText: 'LongLineEnd' }).waitFor()
  assert.ok((await content.textContent()).length <= 16384)
  await page.setViewportSize({ width: 800, height: 420 })
  assert.ok(await page.getByRole('button', { name: '返回文稿', exact: true }).isVisible())
  await page.screenshot({ path: path.join(output, '800-long-line.png') })
  report.checks.push('Dense HTML stays inert as source, long single-line TXT remains paged and searchable, and short landscape keeps navigation reachable')
  await page.setViewportSize({ width: 360, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  await page.evaluate(axeSource)
  report.accessibility = await page.evaluate(async () => {
    const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return { violations: result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), incomplete: result.incomplete.map(({ id }) => id) }
  })
  assert.deepEqual(report.accessibility.violations, [])
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  report.checks.push('Source paging at 200% text remains within the viewport and passes the selected axe accessibility rules; touch screen reader validation remains separate')
  await context.close(); context = await launch('stalled')
  content = page.locator('.source-page-content')
  await open('Small.md')
  await content.waitFor(); assert.equal(await page.getByText('排版准备时间较长，已分段显示原文',{exact:true}).count(),0)
  assert.deepEqual(await page.evaluate(() => window.__workers), { made: 1, ended: 1 })
  await back(); await open('Small.md')
  await page.getByRole('button', { name: '直接阅读原文', exact: true }).tap()
  await content.waitFor()
  assert.deepEqual(await page.evaluate(() => window.__workers), { made: 2, ended: 2 })
  report.checks.push('A simulated stalled parser is terminated on timeout or direct-source choice and preserves readable original text')
  await context.close()
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Document budget browser: ${report.checks.length} groups passed; ${output}`)
} catch (error) {
  report.failure = String(error.stack || error)
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); throw error
} finally { await browser.close() }
