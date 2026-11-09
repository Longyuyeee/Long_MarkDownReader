import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = process.env.LONGEDIT_NAV_OUTPUT || `docs/evidence/mobile-navigation-2026-10-26/${baseline ? 'before' : 'candidate'}-${Date.now()}`
await mkdir(output, { recursive: true })
const report = { baseline, nativeAndroidTest: false, checks: [], screens: [], errors: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
await context.addInitScript(() => {
  if (window !== window.top) return
  if (!localStorage.getItem('navigation-fixture')) {
    const documents = {}, recent = []
    const add = (relativePath, content, rootId = 'local') => {
      documents[JSON.stringify([rootId, relativePath])] = { rootId, relativePath, content, signature: content, modified: 1 }
    }
    for (let i = 0; i < 100; i++) add(`项目${String(i).padStart(3, '0')}/笔记.md`, `# 项目记录 ${i}\n\n保留原文。`)
    for (let i = 0; i < 120; i++) {
      const relativePath = `阅读${String(i).padStart(3, '0')}.md`
      add(relativePath, `# 导航阅读 ${i}\n\n查找导航资料，返回后继续原来的位置。`)
      if (i < 12) recent.push({ rootId: 'local', relativePath })
    }
    add('外部项目/外部记录.md', '# 外部原文必须保留', 'outside')
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, libraries: [{ id: 'outside', name: '外部资料库', external: true, writable: true, available: true }], documents, drafts: {} }))
    localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify(recent))
    localStorage.setItem('navigation-fixture', 'true')
  }
  const set = Storage.prototype.setItem
  Storage.prototype.setItem = function(key, value) {
    if (window.__navigationFailDraft && key === 'longedit-mobile-preview-v1' && Object.keys(JSON.parse(value).drafts || {}).length) throw new DOMException('Navigation fixture quota', 'QuotaExceededError')
    return set.call(this, key, value)
  }
})
const page = await context.newPage()
page.on('pageerror', error => report.errors.push(error.message))
const button = name => page.getByRole('button', { name, exact: true })
const file = name => page.locator('.file-row').filter({ has: page.getByText(name, { exact: true }) })
const filter = () => page.getByLabel('按文件名查找', { exact: true })
const back = () => page.evaluate(() => window.__longeditMobileBack())
async function state() {
  return { query: await filter().inputValue(), rows: await page.locator('.file-row').count(), scroll: await page.evaluate(() => scrollY) }
}
async function capture(name) {
  const top = Math.ceil((await page.locator('.preview-ribbon').boundingBox())?.height || 0)
  await page.screenshot({ path: path.join(output, `${name}.png`), clip: { x: 0, y: top, width: 390, height: 872 - top } })
  report.screens.push(name)
}
async function settleLibrary() { await filter().waitFor(); await page.locator('.file-row').first().waitFor() }
try {
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await settleLibrary(); await filter().fill('项目')
  await button('再显示 20 项').click(); await file('项目084').scrollIntoViewIfNeeded()
  const folderOrigin = await state()
  await capture('folder-before-open'); await file('项目084').click(); await filter().fill('笔记'); await file('笔记.md').click()
  await page.frameLocator('iframe.mobile-reader').getByRole('heading', { name: '项目记录 84', exact: true }).waitFor()
  await back(); await file('笔记.md').waitFor(); if (!baseline) assert.equal(await filter().inputValue(), '笔记'); await back()
  await page.locator('.section-heading h2').waitFor(); await settleLibrary()
  const folderReturn = await state(); report.folder = { before: folderOrigin, after: folderReturn }
  await capture('folder-after-return')
  if (!baseline) {
    assert.equal(folderReturn.query, folderOrigin.query); assert.equal(folderReturn.rows, folderOrigin.rows)
    assert.ok(Math.abs(folderReturn.scroll - folderOrigin.scroll) <= 2, JSON.stringify(report.folder))
    assert.equal(await file('项目084').evaluate(e => e === document.activeElement), true)
    report.checks.push('Document Back returns to its folder; parent Back restores the original query, expanded list, scroll and focused folder')
  }
  await button('设置').click(); await back(); await settleLibrary()
  if (!baseline) { assert.deepEqual(await state(), folderReturn); await button('资料').click(); assert.deepEqual(await state(), folderReturn); report.checks.push('Switching root flows and tapping the selected root keep the library view instead of clearing it') }
  await filter().fill('阅读'); await button('再显示 40 项').click(); await file('阅读095.md').scrollIntoViewIfNeeded()
  const documentOrigin = await state()
  await file('阅读095.md').click(); await page.frameLocator('iframe.mobile-reader').getByRole('heading', { name: '导航阅读 95', exact: true }).waitFor()
  if (!baseline) {
    await button('编辑').click(); await page.evaluate(() => window.__navigationFailDraft = true)
    await page.locator('.cm-content').fill('# 不能丢失的输入\n\n草稿失败时不能离开。')
    await back(); await page.getByText('草稿保护失败', { exact: true }).waitFor()
    assert.match(await page.locator('.cm-content').innerText(), /不能丢失的输入/)
    assert.equal(await page.locator('.file-row').count(), 0)
    await capture('failed-draft-stays-in-editor')
    await page.evaluate(() => { window.__navigationFailDraft = false })
    const replies = await page.evaluate(() => [window.__longeditMobileBack(), window.__longeditMobileBack()])
    assert.deepEqual(replies, [true, true]); await settleLibrary()
    const returned = await state(); assert.equal(returned.query, documentOrigin.query); assert.equal(returned.rows, documentOrigin.rows)
    assert.ok(Math.abs(returned.scroll - documentOrigin.scroll) <= 2)
    assert.equal(await file('阅读095.md').evaluate(e => e === document.activeElement), true)
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
    const key = JSON.stringify(['local', '阅读095.md'])
    assert.match(data.documents[key].content, /^# 导航阅读 95/); assert.match(data.drafts[key].content, /不能丢失的输入/)
    assert.equal(await page.locator('.mobile-notice').count(), 0); await capture('document-after-return')
    report.checks.push('A failed private draft blocks Back with input intact; retry protects the draft, repeated Back consumes only the one document, and the source bytes stay unchanged')
  } else { await back(); await settleLibrary() }
  await button('最近').click(); await file('阅读001.md').click()
  await page.frameLocator('iframe.mobile-reader').getByRole('heading', { name: '导航阅读 1', exact: true }).waitFor(); await back()
  await page.getByRole('heading', { name: '最近打开', exact: true }).waitFor()
  if (!baseline) report.checks.push('Opening from Recent returns to Recent, independently of the library folder and filter')
  if (!baseline) {
    await button('搜索').click(); const search = page.getByLabel('查找资料内容', { exact: true })
    await search.fill('导航'); const hit = page.locator('[data-result-path="阅读010.md"]')
    await hit.waitFor(); await hit.scrollIntoViewIfNeeded(); const searchScroll = await page.evaluate(() => scrollY)
    await hit.click(); await page.frameLocator('iframe.mobile-reader').getByRole('heading', { name: '导航阅读 10', exact: true }).waitFor()
    await back(); assert.equal(await page.locator('iframe.mobile-reader').count(), 1)
    await back(); await search.waitFor()
    await page.waitForFunction(expected => document.activeElement?.getAttribute('data-result-path') === '阅读010.md' && Math.abs(scrollY - expected) <= 2, searchScroll)
    assert.equal(await search.inputValue(), '导航'); await capture('search-after-return')
    report.checks.push('Content search Back closes document-find first, then restores the query, result scroll and selected result without reopening the keyboard')
    await button('资料').click(); await settleLibrary(); assert.equal(await button('最近').getAttribute('aria-pressed'), 'true'); await button('全部').click(); assert.equal(await filter().inputValue(), '阅读')
    const pdfOrigin = await state(); await button('添加资料').click()
    const choosing = page.waitForEvent('filechooser'); await button('导入 PDF 阅读').click()
    await (await choosing).setFiles({ name: '导航检查.pdf', mimeType: 'application/pdf', buffer: await readFile('scripts/fixtures/mobile-pdf-navigation-design.pdf') })
    await page.waitForFunction(() => document.querySelector('.textLayer span') && !document.querySelector('.pdf-render-status'))
    await page.evaluate(() => { window.__longeditMobileBack(); window.__longeditMobileBack() })
    await settleLibrary(); assert.deepEqual(await state(), pdfOrigin)
    report.checks.push('Opening a PDF through the add menu and repeated Back returns once to the preserved library view')
    await page.locator('.library-selector').click(); const localChoiceOrigin = await state(); await page.locator('.root-option').filter({ hasText: '外部资料库' }).click()
    await file('外部项目').click(); await filter().fill('外部')
    await page.locator('.library-selector').click(); await page.locator('.root-option').filter({ hasText: '手机资料库' }).click()
    await settleLibrary(); assert.equal(await filter().inputValue(), '阅读')
    await page.locator('.library-selector').click(); await page.locator('.root-option').filter({ hasText: '外部资料库' }).click()
    await file('外部记录.md').waitFor(); assert.equal(await filter().inputValue(), '外部')
    await page.locator('.library-selector').click(); await button('停止访问 外部资料库').click()
    await page.getByText(/将撤销「外部资料库」的目录授权/).waitFor(); await button('停止访问').click()
    await button('关闭面板').click(); await settleLibrary(); assert.equal(await filter().inputValue(), '阅读'); assert.equal((await state()).rows, pdfOrigin.rows); await page.waitForFunction(expected => Math.abs(scrollY - expected) <= 2, localChoiceOrigin.scroll)
    const disconnected = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
    assert.equal(disconnected.documents[JSON.stringify(['outside', '外部项目/外部记录.md'])].content, '# 外部原文必须保留')
    assert.match(disconnected.drafts[JSON.stringify(['local', '阅读095.md'])].content, /不能丢失的输入/)
    report.checks.push('Library switching restores each folder and filter; stopping external access returns to the local view without deleting source documents or drafts')
    await button('添加资料').click(); await button('新建笔记').click()
    await page.getByLabel('笔记名称', { exact: true }).fill('新建后可见')
    await button('开始记录').click(); await page.locator('.cm-content').fill('# 新建资料')
    await button('保存').click(); await page.getByText('已保存到文件', { exact: true }).first().waitFor()
    await back(); await file('新建后可见.md').waitFor()
    assert.equal(await file('新建后可见.md').evaluate(e => e === document.activeElement), true); await capture('new-note-after-return')
    report.checks.push('Returning after creating a file reveals the new target even when the former filter would exclude it')


  }
  assert.deepEqual(report.errors, []); report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; process.exitCode = 1
  report.failureState = await page.evaluate(() => ({ scroll: scrollY, focus: document.activeElement?.getAttribute('aria-label'), query: document.querySelector('[aria-label="按文件名查找"]')?.value, busy: document.querySelector('.mobile-workspace')?.getAttribute('aria-busy') })).catch(() => null)
  await page.screenshot({ path: path.join(output, 'failed.png'), timeout: 5000 }).catch(() => {})
} finally {
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2))
  await browser.close(); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output, failure: report.failure }))
}
