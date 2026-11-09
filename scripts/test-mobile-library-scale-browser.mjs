import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = `docs/evidence/mobile-0.1.0/library-scale-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const report = { kind: baseline ? 'large-library-before-changes' : 'large-library-browser-tasks', nativeAndroidTest: false, checks: [], measurements: {}, errors: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    if (window !== window.top) return
    const documents = {}
    for (let i = 0; i < 1000; i++) {
      const relativePath = `资料-${String(i).padStart(4, '0')}.md`
      documents[JSON.stringify(['local', relativePath])] = { rootId: 'local', relativePath, content: `# 文稿 ${i}\n\n` + '移动资料验收。'.repeat(80), signature: `fixture-${i}`, modified: 1 }
    }
    if (!localStorage.getItem('longedit-scale-fixture')) {
      localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents, drafts: {} }))
      localStorage.setItem('longedit-scale-fixture', 'true')
    }
    window.__scaleLoads = 0
    const read = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) { if (key === 'longedit-mobile-preview-v1') window.__scaleLoads++; return read.call(this, key) }
    window.__scaleStart = performance.now()
    window.__scaleMaxDelay = 0
    let previous = performance.now()
    setInterval(() => { const now = performance.now(); window.__scaleMaxDelay = Math.max(window.__scaleMaxDelay, now - previous); previous = now }, 16)
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.file-row').first().waitFor()
  report.measurements.initial = await page.evaluate(() => ({ rows: document.querySelectorAll('.file-row').length, domElements: document.querySelectorAll('body *').length, elapsedMs: performance.now() - window.__scaleStart, maxIntervalMs: window.__scaleMaxDelay, previewStorageLoads: window.__scaleLoads }))
  await page.screenshot({ path: path.join(output, 'initial-library.png') })
  if (baseline) {
    assert.equal(report.measurements.initial.rows, 1000)
    report.checks.push('Captured the original 1,000-row list before changing pagination')
  } else {
    assert.equal(report.measurements.initial.rows, 80)
    await page.getByRole('button', { name: '再显示 80 项', exact: true }).tap()
    assert.equal(await page.locator('.file-row').count(), 160)
    assert.equal(await page.locator('.file-row').nth(80).evaluate(row => row === document.activeElement), true)
    await page.locator('.file-row').nth(150).tap()
    await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
    await page.locator('.file-row').nth(150).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.file-row')[150] === document.activeElement)
    assert.equal(await page.locator('.file-row').count(), 160)
    assert.equal(await page.locator('.file-row').nth(150).evaluate(row => row === document.activeElement), true)
    report.checks.push('80-row first page, explicit next batch focuses its first row, opening and returning keeps loaded rows and file focus')
  }
  const filter = page.getByRole('textbox', { name: '按文件名查找' })
  await filter.fill('0999'); await page.getByRole('button', { name: /资料-0999.md/ }).waitFor()
  assert.equal(await page.locator('.file-row').count(), 1)
  report.checks.push('Folder name filter includes the last loaded metadata entry, beyond the first visible page')
  if (!baseline) {
    await filter.fill(''); assert.equal(await page.locator('.file-row').count(), 80)
    await page.getByRole('button', { name: '搜索', exact: true }).tap()
    await page.getByRole('button', { name: '名称与路径', exact: true }).tap()
    const loadsBefore = await page.evaluate(() => window.__scaleLoads)
    const started = Date.now()
    await page.getByRole('textbox', { name: '查找资料内容' }).fill('0999')
    await page.locator('.search-result').filter({ hasText: '资料-0999.md' }).waitFor()
    report.measurements.pathSearch = { elapsedWithAutomationMs: Date.now() - started, previewStorageLoads: (await page.evaluate(() => window.__scaleLoads)) - loadsBefore }
    assert.ok(report.measurements.pathSearch.previewStorageLoads < 20, 'Path-only search must not reread 1,000 document bodies')
    await page.locator('.search-result').tap()
    await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '文稿 999', exact: true }).waitFor()
    assert.equal(await page.getByText(/文件已有变化/).count(), 0)
    await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
    await page.waitForFunction(() => document.querySelector('.search-result') === document.activeElement)
    report.checks.push('1,000-file path search reads metadata only, last file opens, missing metadata signature does not claim an external source change')
    await page.screenshot({ path: path.join(output, 'path-search.png') })
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const stop = [...document.querySelectorAll('button')].find(button => button.textContent === '停止查找')
        // Let newly mounted Vue listeners settle before routing a click
        // through the workspace capture listener (Vue timestamps events).
        if (stop) { observer.disconnect(); setTimeout(() => stop.click(), 2) }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await page.getByRole('textbox', { name: '查找资料内容' }).fill('资料')
    await page.getByText('查找已停止，修改关键词或重新查找。', { exact: true }).waitFor()
    assert.equal(await page.locator('.search-result').count(), 0)
    await page.getByRole('button', { name: '重新查找', exact: true }).tap()
    await page.getByText('1000 份', { exact: true }).waitFor()
    assert.equal(await page.locator('.search-result').count(), 100)
    report.checks.push('DOM-driven Stop during a yielded metadata scan publishes no partial result; retry retains all 1,000 matches and caps displayed results at 100')

    await page.getByRole('button', { name: '资料', exact: true }).tap()
    await page.getByRole('button', { name: '添加资料', exact: true }).tap()
    await page.getByRole('button', { name: '新建笔记', exact: true }).tap()
    await page.getByRole('textbox', { name: '笔记名称', exact: true }).fill('资料-0700-新建')
    await page.getByRole('button', { name: '开始记录', exact: true }).tap()
    await page.getByLabel('笔记正文').fill('新建后仍能找到自己')
    await page.getByRole('button', { name: '保存', exact: true }).tap()
    await page.getByText('已保存到文件', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '返回资料库', exact: true }).tap()
    const created = page.locator('.file-row').filter({ hasText: '资料-0700-新建.md' })
    await created.waitFor()
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('资料-0700-新建.md'))
    assert.equal(await created.evaluate(row => row === document.activeElement), true)
    assert.ok(await page.locator('.file-row').count() > 700)
    report.checks.push('Saving a newly created file beyond the first batch reveals and focuses its actual row on return')

    await page.evaluate(() => {
      const documents = {}
      for (let i = 0; i < 100; i++) {
        const relativePath = `文件夹-${String(i).padStart(3, '0')}/正文.md`
        documents[JSON.stringify(['local', relativePath])] = { rootId: 'local', relativePath, content: '# 文件夹正文', signature: `folder-${i}`, modified: 0 }
      }
      localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents, drafts: {} }))
      localStorage.removeItem('longedit-mobile-recent-v1')
    })
    await page.reload(); await page.locator('.file-row').first().waitFor()
    await page.getByRole('button', { name: '再显示 20 项', exact: true }).tap()
    await page.locator('.file-row').filter({ hasText: '文件夹-099' }).tap()
    await page.locator('.file-row').filter({ hasText: '正文.md' }).waitFor()
    assert.ok((await page.locator('.file-row').innerText()).includes('时间未提供'))
    await page.getByRole('button', { name: '文件夹-099', exact: true }).tap()
    const folder = page.locator('.file-row').filter({ hasText: '文件夹-099' })
    assert.equal(await folder.evaluate(row => row === document.activeElement), true)
    assert.equal(await page.locator('.file-row').count(), 100)
    report.checks.push('Returning to a parent reveals a folder beyond the first batch and restores keyboard focus')
    await page.getByRole('button', { name: '搜索', exact: true }).tap()
    await page.getByRole('button', { name: '名称与路径', exact: true }).tap()
    const search = page.getByRole('textbox', { name: '查找资料内容' })
    await search.fill('文件夹-099'); await page.locator('.search-result').waitFor()
    await page.getByRole('button', { name: '搜索说明', exact: true }).waitFor()
    await page.getByRole('button', { name: '文档源文', exact: true }).tap()
    await search.fill('文件夹正文'); await page.getByText('100 份', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '文档源文', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const stop = [...document.querySelectorAll('button')].find(button => button.textContent === '停止查找')
        if (!stop) return
        observer.disconnect()
        const input = document.querySelector('input[aria-label="查找资料内容"]')
        input.value = '绝不匹配的新查询'; input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await search.fill('文件夹')
    await page.getByText(/本次读取的资料中没有匹配/).waitFor()
    assert.equal(await search.inputValue(), '绝不匹配的新查询')
    assert.equal(await page.locator('.search-result').count(), 0)
    report.checks.push('Path-only to content scope reads a fresh body snapshot; changing query during a yielded scan never shows the obsolete hits')
  }
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) { report.failure = String(error); throw error }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
