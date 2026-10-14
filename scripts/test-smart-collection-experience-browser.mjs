import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v112-sidebar-density/collections'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const checks = [], errors = [], layouts = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.locator('#tab-collections').click()
  const panel = page.getByRole('region', { name: '智能集合条件' })
  assert.equal(await panel.getByRole('textbox').count(), 0)
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').length), 0)
  await page.evaluate(() => {
    const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
    a.store.theme = 'green'; a.store.visualStyle = 'soft'; a.collectionFailure = false; a.collectionEmpty = false; a.collectionTruncated = false
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'search_smart_collection') {
        a.calls.push({ command, args }); if (a.collectionFailure) throw Error('模拟索引暂时不可用')
        return { results: a.collectionEmpty ? [] : [{ title: '项目方案.md', path: 'C:/workflow-fixture/项目方案.md', objectType: 'markdown', matchKind: 'body', context: '记录项目进展，随时回看最新资料。', score: 100, extractionFailed: false }], truncated: a.collectionTruncated }
      }
      if (command === 'build_local_graph') { a.calls.push({ command, args }); return { nodes: [{ id: 'note', title: '项目方案', path: 'C:/workflow-fixture/项目方案.md', objectType: 'markdown' }], edges: [] } }
      return original(command, args)
    }
  })
  await panel.screenshot({ path: output + '/01-home-green.png' })
  await panel.getByRole('button', { name: /最近更新/ }).click()
  await panel.getByText('1 项', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').at(-1).args.filters.modifiedWithinDays), 7)
  assert.equal(await panel.getByRole('textbox').count(), 0)
  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await panel.getByRole('button', { name: /继续设置 最近更新/ }).click()
  assert.equal(await panel.getByLabel('集合名称', { exact: true }).inputValue(), '最近更新')
  checks.push('The default page is a saved-collection home without an expanded form or automatic search; starter conditions lead straight to results and unfinished settings can be resumed')

  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await panel.getByRole('button', { name: '全部笔记', exact: true }).click()
  await panel.getByText('1 项', { exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').at(-1).args.objectTypes), ['markdown'])
  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  const searchesBeforeTag = await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').length)
  await panel.getByRole('button', { name: '按标签查找', exact: true }).click()
  assert.equal(await panel.locator('.collection-range').evaluate(el => el.open), true)
  assert.equal(await panel.getByLabel('笔记标签', { exact: true }).evaluate(el => el === document.activeElement), true)
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').length), searchesBeforeTag)
  await panel.getByLabel('笔记标签', { exact: true }).fill('#工作')
  await panel.getByRole('button', { name: '查看资料', exact: true }).click()
  await panel.getByText('1 项', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').at(-1).args.filters.tag), '工作')
  checks.push('All three compact starter buttons remain actionable: recent updates, Markdown-only notes and focused tag conditions send the intended search filters')

  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await panel.getByRole('button', { name: '新建集合', exact: true }).click()
  assert.equal(await panel.locator('.collection-range').evaluate(el => el.open), false)
  await panel.getByLabel('集合名称', { exact: true }).fill('工作资料')
  await panel.getByLabel('关键词（可不填）', { exact: true }).fill('项目')
  await panel.locator('.collection-range > summary').click()
  await panel.getByRole('button', { name: '选择文件夹', exact: true }).click()
  assert.equal(await panel.getByLabel('文件夹', { exact: true }).inputValue(), 'Inbox/参考资料')
  await panel.locator('.n-select').click()
  await page.locator('.n-base-select-option').filter({ hasText: /^Markdown$/ }).click()
  await panel.getByLabel('集合名称', { exact: true }).click()
  await page.locator('.n-base-select-menu:visible').waitFor({ state: 'hidden' })
  await panel.getByLabel('笔记标签', { exact: true }).fill('#工作')
  await panel.getByLabel('修改时间', { exact: true }).selectOption('30')
  await panel.screenshot({ path: output + '/02-editor-green.png' })
  await panel.getByRole('button', { name: '查看资料', exact: true }).click()
  await panel.getByText('1 项', { exact: true }).waitFor()
  const request = await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'search_smart_collection').at(-1).args)
  assert.equal(request.query, '项目'); assert.deepEqual(request.objectTypes, ['markdown'])
  assert.deepEqual(request.filters, { directory: 'Inbox/参考资料', tag: '工作', modifiedWithinDays: 30 })
  await panel.getByRole('button', { name: '保存集合', exact: true }).click()
  await panel.getByText(/集合已保存/).waitFor()
  await panel.screenshot({ path: output + '/03-results-green.png' })
  await panel.locator('.result-details > summary').click()
  await panel.getByText('C:/workflow-fixture/项目方案.md', { exact: true }).waitFor()
  await panel.getByRole('button', { name: /项目方案.md/ }).click()
  await page.waitForFunction(() => window.workflowAudit.store.activeTabId.endsWith('/项目方案.md'))
  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await panel.locator('.collection-open').filter({ hasText: '工作资料' }).click()
  await panel.getByText('1 项', { exact: true }).waitFor()
  checks.push('Folder choice, keyword, type, tag and time retain their native arguments; save leads to a reusable collection, and results retain full locations/excerpts and open the original file')

  await page.evaluate(() => { window.workflowAudit.collectionFailure = true })
  await panel.getByRole('button', { name: '刷新', exact: true }).click()
  await panel.getByRole('alert').waitFor()
  assert.equal(await panel.locator('.collection-error details').evaluate(el => el.open), false)
  await page.evaluate(() => { window.workflowAudit.collectionFailure = false; window.workflowAudit.collectionEmpty = true })
  await panel.getByRole('button', { name: '再试一次', exact: true }).click()
  await panel.getByText('还没有匹配的资料', { exact: true }).waitFor()
  await page.evaluate(() => { window.workflowAudit.collectionEmpty = false; window.workflowAudit.collectionTruncated = true })
  await panel.getByRole('button', { name: '刷新', exact: true }).click()
  await panel.getByText('显示前 200 项，可调整条件缩小范围。', { exact: true }).waitFor()
  checks.push('Read failures show a short local recovery with collapsed technical details; empty matches and limited results remain understandable')

  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await page.evaluate(() => { const a = window.workflowAudit; a.store.savedSearches.push({ id: 'legacy', name: '周会搜索', query: '周会', objectTypes: [], libraryPath: a.store.libraryPath, createdAt: 1 }, { id: 'related', name: '项目关联资料', query: '__longedit_graph_collection__', objectTypes: [], graphRoot: '项目方案.md', graphDepth: 2, libraryPath: a.store.libraryPath, createdAt: 2 }) })
  await panel.getByRole('button', { name: '集合操作 工作资料', exact: true }).click()
  await page.getByText('修改条件', { exact: true }).click()
  await panel.getByLabel('集合名称', { exact: true }).waitFor()
  assert.equal(await panel.getByLabel('文件夹', { exact: true }).inputValue(), 'Inbox/参考资料')
  await panel.getByRole('button', { name: '我的集合', exact: true }).click()
  await panel.locator('.collection-open').filter({ hasText: '周会搜索' }).click()
  await page.waitForFunction(() => document.querySelector('#tab-files').getAttribute('aria-selected') === 'true')
  assert.equal(await page.getByRole('textbox', { name: '搜索文件与正文' }).inputValue(), '周会')
  await page.getByRole('textbox', { name: '搜索文件与正文' }).fill('交付')
  await page.locator('#tab-collections').click()
  await panel.getByRole('button', { name: '保存这个搜索', exact: true }).click()
  await page.waitForFunction(() => window.workflowAudit.store.savedSearches.some(entry => entry.query === '交付'))
  await panel.locator('.collection-open').filter({ hasText: '项目关联资料' }).click()
  await page.waitForFunction(() => window.workflowAudit.calls.some(c => c.command === 'build_local_graph'))
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.find(c => c.command === 'build_local_graph').args.depth), 2)
  await page.locator('#tab-collections').click()
  await panel.getByRole('button', { name: '集合操作 周会搜索', exact: true }).click()
  await page.getByText('删除集合', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await page.waitForFunction(() => !window.workflowAudit.store.savedSearches.some(entry => entry.id === 'legacy'))
  checks.push('Saved legacy keyword searches, related graph collections, edit and confirmed delete retain their existing entry points without moving or deleting documents')

  for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
    for (const width of [1280, 480]) {
      await page.setViewportSize({ width, height: 900 })
      if (await page.getByRole('button', { name: '导航', exact: true }).getAttribute('aria-expanded') === 'false') await page.getByRole('button', { name: '导航', exact: true }).click()
      await page.evaluate(style => { window.workflowAudit.store.visualStyle = style; window.workflowAudit.store.theme = style === 'glass' ? 'dark' : 'green' }, style)
      await page.waitForFunction(style => document.body.dataset.style === style, style)
      await page.waitForFunction(() => {
        const panel = document.querySelector('.smart-collection')
        if (!panel || panel.clientWidth < 100) return false
        for (let el = panel; el; el = el.parentElement) {
          if (el.getAnimations().some(a => ['running', 'pending'].includes(a.playState) && a.effect?.getTiming().iterations !== Infinity)) return false
        }
        return true
      })
      const layout = await panel.evaluate(el => ({ style: document.body.dataset.style, width: innerWidth, overflow: el.scrollWidth > el.clientWidth, radius: getComputedStyle(el.querySelector('.collection-card')).borderRadius }))
      assert.equal(layout.overflow, false); layouts.push(layout)
      await panel.getByRole('button', { name: '新建集合', exact: true }).click()
      await panel.getByLabel('集合名称', { exact: true }).waitFor()
      assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth), false)
      await panel.getByRole('button', { name: '我的集合', exact: true }).click()
    }
  }
  assert.ok(new Set(layouts.map(layout => layout.radius)).size >= 4)
  await page.setViewportSize({ width: 1280, height: 900 })
  if (await page.getByRole('button', { name: '导航', exact: true }).getAttribute('aria-expanded') === 'false') await page.getByRole('button', { name: '导航', exact: true }).click()
  await page.evaluate(() => { window.workflowAudit.store.theme = 'green'; window.workflowAudit.store.visualStyle = 'soft' })
  await panel.screenshot({ path: output + '/04-saved-green.png' })
  await page.evaluate(() => { window.workflowAudit.store.theme = 'dark'; window.workflowAudit.store.visualStyle = 'soft' })
  await page.waitForFunction(() => document.body.dataset.theme === 'dark')
  await panel.screenshot({ path: output + '/05-saved-dark.png', animations: 'disabled' })
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.some(c => /^(move_|create_new_file|delete_item)/.test(c.command))), false)
  assert.deepEqual(errors, [])
  await fs.writeFile(output + '/results.json', JSON.stringify({ checks, layouts, errors, scope: 'Real App/LibraryMode/SmartCollectionPanel; mocked native lookup/config and graph replies. Existing native collection engine unchanged.' }, null, 2))
  console.log(JSON.stringify({ checks, layouts: layouts.length, errors }, null, 2))
} finally { await browser.close() }
