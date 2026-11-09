import { readMobileDocument } from './mobile-document-navigation.mjs'
import { openMobileDocumentAction } from './mobile-document-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = `docs/evidence/mobile-0.1.0/accessibility-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: baseline ? 'accessibility-before-fixes' : 'accessibility-browser-tasks', nativeAndroidTest: false, axeVersion: require('axe-core/package.json').version, checks: [], scans: [], errors: [], externalRequests: [], excluded: ['Sandboxed document iframe internals: CSP is preserved; native screen reader tasks are recorded separately.'] }
let page
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    if (window !== window.top || localStorage.getItem('longedit-accessibility-fixture')) return
    const documents = {}
    for (let i = 0; i < 28; i++) {
      const relativePath = `笔记${String(i).padStart(2, '0')}.md`, content = `# 阅读标题 ${i}\n\n这是一段无障碍查找验收正文。\n\n- 第一项\n- 第二项\n`
      const doc = { rootId: 'local', relativePath, content, signature: content, modified: 1 }
      documents[JSON.stringify(['local', relativePath])] = doc
    }
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents, drafts: {} }))
    localStorage.setItem('longedit-accessibility-fixture', 'true')
  })
  page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  const focused = locator => locator.evaluate(element => element === document.activeElement)
  async function assertFocused(locator) { await locator.waitFor(); await page.waitForFunction(selector => document.querySelector(selector)?.contains(document.activeElement), await locator.evaluate(element => { element.dataset.a11yFocusCheck = 'current'; return '[data-a11y-focus-check="current"]' })); assert.ok(await focused(locator)); await locator.evaluate(element => delete element.dataset.a11yFocusCheck) }
  async function scan(name) {
    await page.evaluate(axeSource)
    const result = await page.evaluate(async () => {
      const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      const compact = items => items.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })) }))
      return { violations: compact(result.violations), incomplete: compact(result.incomplete), passes: result.passes.length }
    })
    report.scans.push({ name, ...result })
    await writeFile(path.join(output, `${name}.aria.txt`), await page.locator('body').ariaSnapshot())
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
  }
  const previewUrl = process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'
  await page.goto(previewUrl)
  await page.getByRole('button', { name: /笔记00.md/ }).waitFor()
  await scan('library-light')
  await page.getByRole('button', { name: '设置', exact: true }).tap()
  if (!baseline) await assertFocused(page.getByRole('heading', { name: '设置', exact: true }))
  await scan('settings-light')
  await page.locator('[data-focus-key="settings-appearance"]').tap()
  const themeTrigger = page.locator('[data-focus-key="settings-theme"]'), theme = () => page.getByRole('dialog', { name: '主题', exact: true })
  await themeTrigger.tap()
  if (!baseline) assert.equal(await theme().getByRole('button', { name: '跟随系统', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Shift+Tab'); assert.equal(await theme().evaluate(element => element.contains(document.activeElement)), true)
  await page.keyboard.press('Tab'); assert.equal(await theme().evaluate(element => element.contains(document.activeElement)), true)
  await scan('theme-dialog')
  await theme().getByRole('button', { name: '深色', exact: true }).tap()
  await scan('settings-dark')
  await themeTrigger.tap()
  if (!baseline) assert.equal(await theme().getByRole('button', { name: '深色', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Escape')
  if (!baseline) await assertFocused(themeTrigger)
  await themeTrigger.tap(); await theme().getByRole('button', { name: '浅色', exact: true }).tap()
  await page.getByRole('button', { name: '返回设置', exact: true }).tap()
  await page.locator('[data-focus-key="settings-storage"]').tap()
  if (!baseline) assert.equal(await page.locator('.root-option[aria-pressed="true"]').count(), 1)
  await scan('library-settings-page')
  await page.getByRole('button', { name: '返回设置', exact: true }).tap()
  if (!baseline) await assertFocused(page.locator('[data-focus-key="settings-storage"]'))
  report.checks.push('Settings navigation identifies the new screen; appearance choices and the selected library expose current state; theme modal keyboard focus stays inside and returns to its trigger')

  await page.getByRole('button', { name: '保存恢复记录', exact: true }).tap()
  await page.getByRole('heading', { name: '保存恢复记录', exact: true }).waitFor()
  if (!baseline) await assertFocused(page.getByRole('heading', { name: '保存恢复记录', exact: true }))
  await scan('recovery')
  await page.getByRole('button', { name: '返回设置', exact: true }).tap()
  if (!baseline) await assertFocused(page.getByRole('button', { name: '保存恢复记录', exact: true }))
  await page.getByRole('button', { name: '资料', exact: true }).tap()
  if (!baseline) await assertFocused(page.getByRole('heading', { name: '我的资料', exact: true }))
  const row = page.locator('.file-row').filter({ has: page.getByText('笔记19.md', { exact: true }) })
  await row.scrollIntoViewIfNeeded()
  const beforeScroll = await page.evaluate(() => scrollY)
  await row.tap()
  await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '阅读标题 19', exact: true }).waitFor()
  if (!baseline) await assertFocused(page.getByRole('heading', { name: '笔记19.md', exact: true }))
  await scan('reader-light')
  await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
  await row.waitFor()
  if (!baseline) {
    await assertFocused(row)
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - beforeScroll) < 4, 'The library returns to the same scroll location')
  }
  report.checks.push('Returning from a document restores the actual list row and scroll location; recovery center returns to its settings entry')

  await row.tap()
  await openMobileDocumentAction(page, '在文档内查找')
  await page.getByLabel('查找文档内容', { exact: true }).fill('正文')
  await page.getByRole('button', { name: '关闭文档查找', exact: true }).tap()
  if (!baseline) await assertFocused(page.getByRole('button', { name: '文档操作', exact: true }))
  await page.getByRole('button', { name: '编辑', exact: true }).tap()
  await assertFocused(page.getByLabel('笔记正文', { exact: true }))
  await page.getByLabel('笔记正文', { exact: true }).press('Control+End')
  await page.keyboard.insertText('\n本轮输入')
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await scan('editor-light')
  if (!baseline) {
    const live = page.locator('.assistive-status:not(.document-incoming-status)')
    await live.getByText('草稿已保护', { exact: false }).waitFor()
    await page.getByLabel('笔记正文', { exact: true }).press('End')
    await page.keyboard.insertText('继续')
    assert.equal(await live.textContent(), '未保存草稿已保护，可稍后继续。')
    await page.getByRole('button', { name: '保存', exact: true }).tap()
    await live.getByText('已保存到文件', { exact: true }).waitFor()
  }
  await readMobileDocument(page)
  if (!baseline) await assertFocused(page.getByRole('heading', { name: '笔记19.md', exact: true }))
  await page.getByRole('button', { name: '文档操作', exact: true }).tap()
  await page.getByRole('button', { name: '添加或修复图片', exact: true }).tap()
  await scan('images-dialog')
  if (!baseline) {
    await page.keyboard.press('Tab')
    assert.equal(await page.locator('.bottom-sheet').evaluate(element => element.contains(document.activeElement)), true)
  }
  await page.keyboard.press('Escape')
  if (!baseline) await assertFocused(page.getByRole('button', { name: '文档操作', exact: true }))
  report.checks.push('Reading and document search return focus to the logical control; typing keeps editor focus; settled draft/save statuses are announced without per-keystroke progress churn')

  await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
  await page.getByRole('button', { name: '添加资料', exact: true }).tap()
  await page.getByRole('button', { name: '新建笔记', exact: true }).tap()
  await page.getByLabel('笔记名称', { exact: true }).fill('非法/名称')
  await page.getByRole('button', { name: '开始记录', exact: false }).tap()
  await page.getByRole('alert').getByText('名称中请不要使用路径或特殊符号', { exact: false }).waitFor()
  if (!baseline) assert.equal(await page.getByRole('alert').evaluate(element => !!element.closest('[role="dialog"]')), true)
  await scan('creation-error-dialog')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '搜索', exact: true }).tap()
  await page.getByLabel('查找资料内容', { exact: true }).fill('无障碍')
  await page.locator('.search-result').first().waitFor()
  await scan('search-light')
  await page.getByRole('button', { name: '切换深色', exact: true }).tap()
  await scan('search-dark')
  report.checks.push('Creation errors remain perceivable inside the modal; content search exposes named results in both appearances')
  if (!baseline) {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
    await page.getByRole('button', { name: '设置', exact: true }).tap()
    await scan('settings-dark-200')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const sizes = await page.locator('button.icon-button:visible').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute('aria-label'), width: rect.width, height: rect.height } }))
    assert.ok(sizes.every(size => size.width >= 48 && size.height >= 48), JSON.stringify(sizes))
    report.checks.push('200% type at 360 CSS px preserves layout, 48px icon targets, and reduced motion')
    assert.deepEqual(report.scans.flatMap(scan => scan.violations.map(violation => ({ screen: scan.name, ...violation }))), [])
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  }
  report.passed = !baseline
} catch (error) {
  report.passed = false; report.failure = String(error); process.exitCode = 1
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  console.log(JSON.stringify({ output, baseline, passed: report.passed, checks: report.checks, scans: report.scans.map(scan => ({ name: scan.name, violations: scan.violations.map(item => item.id) })), failure: report.failure }, null, 2))
}
