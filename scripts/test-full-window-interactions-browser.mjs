import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.FULL_WINDOW_OUTPUT || '.release-secrets/ui-global-review/after')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, args: ['--no-proxy-server'] })
const results = []
const pages = []
async function open(fixture, surface = 'embedded', width = 800, height = 600) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/scripts/fixtures/vditor/**', route => route.continue({ url: route.request().url().replace('/scripts/fixtures/vditor/', '/vditor/') }))
  await page.goto(`http://127.0.0.1:15941/scripts/fixtures/full-window-review-browser.html?fixture=${fixture}&surface=${surface}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.fullWindowAudit?.ready, undefined, { timeout: 60000 })
  page.setDefaultTimeout(15000)
  await page.waitForTimeout(600)
  pages.push({ page, errors })
  return page
}
async function reachable(locator) {
  await locator.waitFor({ state: 'visible' })
  assert.ok(await locator.evaluate(el => {
    const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1 && top && (el.contains(top) || top.contains(el))
  }), 'Control is outside the window or covered')
}
async function passed(name, page, screenshot) {
  results.push(name); console.log(name)
  if (screenshot) await page.screenshot({ path: resolve(output, screenshot + '.png') })
}
try {
  const text = await open('text-redesign', 'embedded', 1920, 1080)
  const editor = text.locator('.cm-content').first()
  await editor.click(); await text.keyboard.press('Control+End'); await text.keyboard.insertText('\n保留这段未保存的内容')
  for (const [width, height] of [[1000,700],[800,600],[640,480],[1920,1080]]) {
    await text.setViewportSize({ width, height })
    await text.evaluate(() => { window.fullWindowAudit.store.visualStyle = window.innerWidth < 900 ? 'neo' : 'glass' })
    await text.waitForTimeout(450)
    assert.ok((await editor.innerText()).includes('保留这段未保存的内容'))
    assert.equal(await text.locator('.workspace-tabs:visible').count(), 1)
  }
  assert.equal(await text.evaluate(() => window.fullWindowAudit.calls.filter(c => /write_text_document|save_text_document/.test(c.command)).length), 0)
  await passed('完整应用中缩放窗口、切换风格保留文本草稿，不重复标签栏、不触发保存', text)
  await text.evaluate(() => window.fullWindowAudit.reportError(new Error('路径不存在或不可访问 (os error 2)')))
  await text.locator('#runtime-error-notice').waitFor()
  await editor.click(); await text.keyboard.insertText('，报错后继续编辑')
  assert.ok((await editor.innerText()).includes('报错后继续编辑'))
  const notice = await text.locator('#runtime-error-notice').boundingBox()
  assert.ok(notice.height <= 1080 * .36 && notice.width <= 381)
  await text.getByRole('button', { name: '关闭提示', exact: true }).click()
  await passed('路径异常只显示可关闭的局部提示，正文可继续输入', text, 'error-recovery')

  const library = await open('library-shell', 'page', 1000, 700)
  const tabs = library.locator('.sidebar-tabs-header .icon-tab')
  assert.equal(await tabs.count(), 7)
  const rows = await tabs.evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().top)))
  assert.ok(Math.max(...rows) - Math.min(...rows) <= 2)
  await library.locator('.workspace-tab').first().hover(); await library.waitForTimeout(800)
  assert.equal(await library.locator('#longedit-app-tooltip:visible,.n-tooltip:visible').count(), 0)
  await library.locator('.document-breadcrumb').hover(); await library.waitForTimeout(800)
  assert.equal(await library.locator('#longedit-app-tooltip:visible,.n-tooltip:visible').count(), 0)
  await passed('侧栏七入口保持一行；文件标签和文件名悬停不显示路径浮窗', library)
  const tree = library.locator('.library-file-tree .n-tree-node-content').filter({ hasText: '项目方案.md' }).first()
  await tree.click({ button: 'right' })
  const more = library.locator('.n-dropdown-option').filter({ hasText: /^更多操作$/ })
  await more.hover()
  const copyPath = library.locator('.n-dropdown-option').filter({ hasText: /^编辑显示样式$/ })
  await reachable(copyPath)
  await passed('文件右键“更多操作”子菜单悬停展开且可触达', library, 'file-context-menu')
  await library.mouse.click(950, 400)
  await library.setViewportSize({ width: 640, height: 480 }); await library.waitForTimeout(450)
  await library.getByTestId('library-document-menu').click()
  const menu = library.locator('.document-menu-content')
  await menu.waitFor()
  assert.ok((await menu.innerText()).includes('正文宽度'))
  assert.ok((await menu.innerText()).includes('历史与差异'))
  assert.ok((await menu.innerText()).includes('编辑模式'))
  await passed('小窗口将重复的模式、宽度、导出、历史快捷入口收进文档菜单，功能仍在', library, 'document-menu-compact')

  const graph = await open('graph-redesign', 'page', 640, 480)
  await graph.getByTestId('graph-tools-entry').click()
  await reachable(graph.getByTestId('graph-fit-all'))
  await passed('小窗口图谱工具弹层完整显示，适合窗口可直接操作', graph, 'graph-menu-compact')
  await graph.getByTestId('graph-fit-all').click()
  await graph.locator('.graph-filter-trigger').click()
  const filter = graph.locator('.filter-panel')
  await reachable(filter.locator('select'))
  assert.equal(await graph.evaluate(() => document.body.dataset.appPopupOpen), 'true')
  await filter.locator('select').selectOption('7d')
  assert.equal(await filter.locator('select').inputValue(), '7d')
  await passed('图谱筛选独立弹出，时间条件可修改，未被工具栏裁掉', graph, 'graph-filter-compact')

  const table = await open('table-redesign', 'embedded')
  const createView = table.locator('.view-create-menu summary')
  await createView.click(); await createView.hover(); await table.waitForTimeout(600)
  assert.equal(await table.evaluate(() => document.body.dataset.appPopupOpen), 'true')
  assert.equal(await table.locator('#longedit-app-tooltip').getAttribute('aria-hidden'), 'true')
  await createView.click()
  await table.waitForTimeout(100)
  assert.equal(await table.evaluate(() => document.body.dataset.appPopupOpen), 'false')
  await passed('原生“新建视图”菜单打开时，提示框让位；关闭后恢复正常提示', table)

  const canvas = await open('canvas-redesign', 'embedded', 640, 480)
  await reachable(canvas.getByRole('button', { name: '适应内容', exact: true }))
  await canvas.getByRole('button', { name: '适应内容', exact: true }).click()
  await reachable(canvas.getByRole('button', { name: '缩小画布', exact: true }))
  assert.equal(await canvas.locator('.canvas-header-actions .primary').count(), 1)
  await passed('Canvas 缩放、适应内容和保存位于固定可见的页头', canvas, 'canvas-fit-compact')

  const mindmap = await open('mindmap-redesign', 'embedded', 1920, 1080)
  await mindmap.getByRole('button', { name: '主题属性', exact: true }).click()
  await mindmap.setViewportSize({ width: 640, height: 480 }); await mindmap.waitForTimeout(550)
  await reachable(mindmap.locator('.map-view-controls button').last())
  const visibleNodes = await mindmap.locator('.map-node').evaluateAll(els => els.filter(el => { const r = el.getBoundingClientRect(); return r.right > 80 && r.x < innerWidth && r.bottom > 210 && r.y < innerHeight - 30 }).length)
  assert.ok(visibleNodes > 0, 'Resizing must not leave a blank mind map')
  await mindmap.getByRole('button', { name: '主题属性', exact: true }).click()
  await mindmap.locator('.inspector').waitFor({ state: 'visible' })
  const field = mindmap.locator('.inspector input').first()
  await field.fill('属性中保留的未保存主题'); await field.press('Tab')
  await mindmap.getByRole('button', { name: '关闭主题属性', exact: true }).click()
  await mindmap.getByRole('button', { name: '主题属性', exact: true }).click()
  assert.equal(await field.inputValue(), '属性中保留的未保存主题')
  await passed('导图缩窗仍能看到主题；属性按需浮出，关闭后草稿保留', mindmap, 'mindmap-properties-compact')

  const json = await open('json-redesign', 'embedded')
  await json.locator('.json-main.inspector-hidden').waitFor()
  await json.getByRole('button', { name: /显示结构与诊断/ }).click()
  await json.locator('.analysis-pane').waitFor({ state: 'visible' })
  await passed('JSON 按编辑区宽度收起诊断栏，原按钮可重新打开', json, 'json-inspector-small')
  const drawio = await open('drawio-redesign', 'embedded')
  await drawio.locator('.stage.inspector-hidden').waitFor()
  await drawio.getByRole('button', { name: '节点属性', exact: true }).click()
  const label = drawio.locator('.properties textarea').first()
  await label.fill('保留的节点草稿')
  await drawio.getByRole('button', { name: '关闭节点属性', exact: true }).click()
  await drawio.getByRole('button', { name: '节点属性', exact: true }).click()
  assert.equal(await label.inputValue(), '保留的节点草稿')
  await passed('draw.io 横向页面页签与属性浮层可操作，关闭不丢失尚未应用的输入', drawio, 'drawio-properties-small')

  const settings = await open('settings-redesign', 'page')
  const categories = settings.locator('.settings-navigation button')
  assert.equal(await categories.count(), 8)
  for (let i = 0; i < 8; i++) {
    const name = (await categories.nth(i).innerText()).trim(); await categories.nth(i).click()
    assert.equal((await settings.locator('.settings-category-heading h2').innerText()).trim(), name)
  }
  await passed('完整设置页八个分类可切换，标题对应', settings)
  for (const { page, errors } of pages) {
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.fullWindowAudit.errors), [])
  }
  await writeFile(resolve(output, 'interactions.json'), JSON.stringify({ checks: results, passed: results.length }, null, 2))
} catch (error) {
  for (const { page } of pages) await page.screenshot({ path: resolve(output, 'interaction-failure-' + pages.indexOf(pages.find(p => p.page === page)) + '.png') }).catch(() => {})
  throw error
} finally { await browser.close() }
