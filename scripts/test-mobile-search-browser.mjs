import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = `docs/evidence/mobile-0.1.0/search-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(path.join(output,'.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'browser-preview-library-search-fixtures', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
let page
async function returnToSearch(){const close=page.getByRole('button',{name:'关闭文档查找',exact:true});if(await close.isVisible()){await page.getByRole('button',{name:'返回文稿',exact:true}).tap();assert.equal(await page.locator('.document-back-button').count(),1)}await page.getByRole('button',{name:'返回搜索结果',exact:true}).tap();await page.getByRole('textbox',{name:'查找资料内容'}).waitFor()}
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => {
    if (window !== window.top || localStorage.getItem('longedit-search-fixture-ready')) return
    const documents = {}, add = (rootId, relativePath, content) => { documents[JSON.stringify([rootId, relativePath])] = { rootId, relativePath, content, signature: content, modified: 1 } }
    add('local', '阅读/计划.md', '# 下周安排\n\n要记下中文[ ]，还有 Alpha alpha。\n\n[链接](https://example.invalid/source-only-token)\n\n<img src="https://example.invalid/leak" onerror="window.__searchLeak=true">')
    add('local', '中文标题.txt', '只有标题包含所查词。')
    add('local', '.private/隐藏.md', 'private-hidden-token')
    add('local', '表格.csv', 'csv-excluded-token')
    for (let i = 0; i < 32; i++) add('local', `资料/备忘-${String(i).padStart(2, '0')}.txt`, `位置验收关键词 ${i}，打开后回来继续查找。`)
    add('external', '外部/外部笔记.md', '外部唯一词 中文')
    for (let i = 0; i < 1002; i++) add('large', `large-${String(i).padStart(4, '0')}.txt`, `large-library-token ${i}`)
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents, drafts: {}, libraries: [{ id: 'external', name: '授权测试库', external: true, available: true, writable: true }, { id: 'large', name: '超限测试库', external: true, available: true, writable: true }] }))
    localStorage.setItem('longedit-search-fixture-ready', 'true')
  })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.getByRole('button', { name: '搜索', exact: true }).tap()
  const input = page.getByRole('textbox', { name: '查找资料内容' })
  const scope = () => page.getByRole('dialog',{name:'搜索范围',exact:true})
  const field = async name => { await page.getByRole('button',{name:'搜索范围',exact:true}).tap(); await scope().getByRole('button',{name,exact:true}).tap() }
  const library = async name => { await page.getByRole('button',{name:'搜索范围',exact:true}).tap(); await page.getByRole('button',{name:/^选择搜索资料库/}).tap(); await page.getByRole('button',{name,exact:true}).tap(); await scope().waitFor(); await page.evaluate(()=>window.__longeditMobileBack()) }
  await page.getByRole('heading', { name: '暂无最近记录',exact:true }).waitFor()
  await input.fill('中文'); await page.locator('.section-heading').getByText('2 份', { exact: true }).waitFor()
  await page.getByRole('button',{name:'更新搜索内容',exact:true}).waitFor()
  assert.equal(await page.locator('.search-result').count(), 2)
  assert.equal(await page.locator('.search-result').first().locator('strong').innerText(), '中文标题.txt')
  await field('文档源文'); await page.locator('.section-heading').getByText('1 份', { exact: true }).waitFor()
  await field('名称与路径'); await page.locator('.search-result-title strong').getByText('中文标题.txt', { exact: true }).waitFor()
  await field('名称与原文'); await input.fill('[ ]')
  await page.locator('.search-result-excerpt mark').getByText('[ ]', { exact: true }).waitFor()
  await input.fill('ALPHA'); await page.locator('.search-result-excerpt mark').getByText('Alpha', { exact: true }).waitFor()
  await input.fill('private-hidden-token'); await page.getByRole('heading',{name:'没有找到匹配',exact:true}).waitFor(); assert.equal(await page.locator('.search-result').count(),0)
  await input.fill('csv-excluded-token'); await page.getByRole('heading',{name:'没有找到匹配',exact:true}).waitFor(); assert.equal(await page.locator('.search-result').count(),0)
  await input.fill('<img'); await page.locator('.search-result-excerpt mark').getByText('<img', { exact: true }).waitFor()
  assert.equal(await page.locator('.search-result img').count(), 0); assert.equal(await page.evaluate(() => window.__searchLeak), undefined)
  await page.screenshot({ path: path.join(output, '360-literal-search.png'), fullPage: true })
  report.checks.push('Recursive saved-text scope, Chinese and literal symbols, case-insensitive Latin, source/path filters, safe excerpts, hidden/unsupported exclusions')

  await input.fill('source-only-token'); await page.locator('.search-result').tap()
  await page.getByRole('textbox', { name: '查找文档内容' }).waitFor()
  await page.getByRole('button', { name: '查看源文命中', exact: true }).tap()
  await page.getByRole('status').filter({ hasText: '1 / 1' }).waitFor()
  await page.locator('.cm-selectionBackground').first().waitFor()
  assert.equal(await page.locator('.cm-selectionBackground').count() > 0, true)
  assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isDisabled(),true)
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents[JSON.stringify(['local','阅读/计划.md'])]);assert.equal(original.modified,1);assert.equal(original.signature,original.content)
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents[JSON.stringify(['local', '阅读/计划.md'])].content.includes('source-only-token')))
  await returnToSearch()
  assert.equal(await input.inputValue(), 'source-only-token')
  await page.getByRole('button',{name:'搜索范围',exact:true}).tap(); assert.equal(await scope().getByRole('button', { name: '名称与原文', exact: true }).getAttribute('aria-pressed'), 'true'); await page.evaluate(()=>window.__longeditMobileBack())
  report.checks.push('Source-only Markdown URL hit opens reading first, offers visible source match without modifying/saving, and preserves the library query')

  await input.fill('位置验收关键词'); await page.locator('.search-result').last().scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => scrollY); assert.ok(before > 1000)
  await page.locator('.search-result').last().tap(); await returnToSearch()
  await page.waitForFunction(y => Math.abs(scrollY - y) < 70, before)
  assert.equal(await page.locator('.search-result').last().evaluate(row => row === document.activeElement), true, '返回时恢复结果项焦点')
  assert.equal(await input.inputValue(), '位置验收关键词')
  await page.screenshot({ path: path.join(output, '360-return-to-results.png') })
  report.checks.push('Opening a lower result and returning preserves query, scope, results and scroll position')

  await input.fill('source-only-token'); await page.locator('.search-result').waitFor()
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')), doc = data.documents[JSON.stringify(['local', '阅读/计划.md'])]; doc.content = '# 外部更新\n\nupdated-external-token'; doc.signature = 'externally-changed-same-time'; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(data)) })
  await page.locator('.search-result').tap(); await page.getByText('文件已变化，请更新搜索',{exact:true}).waitFor()
  await page.frameLocator('iframe[title="文档阅读"]').getByRole('heading', { name: '外部更新', exact: true }).waitFor()
  await returnToSearch(); await page.getByRole('button', { name: '更新搜索内容', exact: true }).tap()
  await page.getByRole('heading',{name:'没有找到匹配',exact:true}).waitFor(); assert.equal(await page.locator('.search-result').count(),0); await input.fill('updated-external-token'); await page.locator('.search-result').tap()
  await page.getByRole('button', { name: '查看源文命中', exact: true }).tap()
  await page.getByLabel('笔记正文').fill('# 修改后\n\nexplicit-save-search-token')
  await page.getByRole('button', { name: '保存', exact: true }).tap(); await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).documents[JSON.stringify(['local','阅读/计划.md'])];return d.content==='# 修改后\n\nexplicit-save-search-token'&&[...document.querySelectorAll('.reader-header button')].some(e=>e.textContent.trim()==='保存'&&e.disabled)})
  await returnToSearch(); await input.fill('explicit-save-search-token'); await page.locator('.search-result').waitFor()
  report.checks.push('External byte changes with unchanged timestamp show latest document and stale notice; refresh removes old hits; explicit save refreshes library search')

  await library('授权测试库 已授权文件夹')
  await input.fill('外部唯一词'); await page.locator('.search-result').waitFor()
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); data.libraries.find(r => r.id === 'external').available = false; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(data)); window.dispatchEvent(new Event('longedit-mobile-pause')); window.dispatchEvent(new Event('longedit-mobile-resume')) })
  await page.getByText('这个资料库暂时无法访问', { exact: true }).waitFor(); assert.equal(await page.locator('.search-result').count(), 0)
  await page.screenshot({ path: path.join(output, '360-unavailable-root.png'), fullPage: true })
  report.checks.push('Root selection changes scope; revoked external permission removes cached search hits on resume')

  await library('超限测试库 已授权文件夹')
  await input.fill('large-library-token'); await page.getByRole('button', { name: '停止读取', exact: true }).tap()
  await page.locator('.search-issues summary').getByText(/项读取说明/).waitFor()
  await page.locator('.search-issues summary').tap(); await page.getByText('已停止读取，结果仅包含已经读完的文件。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '更新搜索内容', exact: true }).tap()
  await page.getByText(/部分资料可搜索 · 1000 份文档/).waitFor()
  await page.getByText(/先显示前 100 份文件/).waitFor(); assert.equal(await page.locator('.search-result').count(), 100)
  await page.screenshot({ path: path.join(output, '360-partial-library.png'), fullPage: true })
  await page.setViewportSize({ width: 800, height: 1024 }); await page.getByRole('button', { name: '切换深色' }).tap()
  await page.screenshot({ path: path.join(output, '800-search-dark.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  report.checks.push('Visible read cancellation stays partial; refresh reports 1000-entry truncation and 100-row result cap; 360px and 800px dark layouts fit')
  assert.equal(report.errors.length, 0); assert.equal(report.externalRequests.length, 0)
  report.passed = true
} catch (error) { report.passed = false; report.failure = String(error?.stack || error); if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); throw error }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
