import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// Uses production Vue views with isolated, simulated IPC. It does not exercise
// installed Tauri commands or claim native file-format fidelity.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.UI_SPACE_OUTPUT || '.release-secrets/ui-content-space/browser')
await mkdir(output, { recursive: true })
const cases = [
  ['workspace', 'workflow-redesign', '.workspace-columns'],
  ['inbox', 'workflow-redesign', '.inbox-browser', '/inbox'],
  ['library', 'library-shell', '.editor-viewport'],
  ['temp', 'temp-redesign', '.vditor'],
  ['text', 'text-redesign', '.editor-stage'],
  ['json', 'json-redesign', '.json-workspace main'],
  ['yaml', 'yaml-redesign', '.yaml-workspace main'],
  ['xml', 'xml-redesign', '.xml-workspace main'],
  ['toml', 'toml-redesign', '.toml-workspace main'],
  ['log', 'log-redesign', '.log-workspace main'],
  ['drawio', 'drawio-redesign', '.drawio-workspace main'],
  ['docx', 'docx-redesign', '.docx-stage'],
  ['odt', 'odt-redesign', '.odt-stage'],
  ['odf', 'odf-redesign', '.odf-content'],
  ['pptx', 'pptx-redesign', '.slide-stage'],
  ['external-office', 'office-handoff', '.office-body'],
  ['legacy-office', 'office-handoff', '.legacy-office-body', '?legacy'],
  ['quick-note', 'quick-note-direct', '.capture-composer textarea'],
  ['graph', 'graph-redesign', '.graph-container'],
  ['canvas', 'canvas-redesign', '.canvas-viewport'],
  ['pdf', 'pdf-redesign', '.pdf-main'],
  ['table', 'table-redesign', '.table-workspace'],
  ['workbook', 'workbook-save', '.workbook-main'],
  ['diagram', 'diagram-redesign', '.studio-workspace'],
  ['mindmap', 'mindmap-redesign', '.mindmap-canvas'],
  ['media', 'media-redesign', '.media-stage'],
  ['settings', 'settings-redesign', '.settings-main'],
  ['capabilities', 'capabilities-redesign', '.capability-list'],
]
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',')
const selected = cases.filter(([name]) => !only || only.includes(name))
const matrixFile = resolve(output, only?.length ? `matrix-${only.join('-')}.json` : 'matrix.json')
const baseUrl=process.env.UI_SPACE_BASE_URL || 'http://127.0.0.1:15941'
const browser=await chromium.launch({headless:true,channel:process.env.LONGEDIT_BROWSER_CHANNEL||undefined,args:['--no-proxy-server']})
console.log('Browser ready')
const reports = []
const interactions = []
const interactionFile = resolve(output, `interactions-${only?.join('-') || 'all'}.json`)
async function checkInteractions(page, name) {
  await page.setViewportSize({ width: 1440, height: 900 })
  if (name === 'text') {
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n界面调整后的未保存内容')
    assert.equal(await page.locator('.format-bar').isVisible(), false)
    await page.getByRole('button', { name: '编码与换行', exact: true }).click()
    await page.locator('.format-bar').waitFor({ state: 'visible' })
    await page.locator('.format-bar label').filter({ hasText: '换行' }).locator('select').selectOption('crlf')
    await page.locator('.cm-content').click()
    assert.ok((await page.locator('.cm-content').innerText()).includes('界面调整后的未保存内容'))
    assert.equal(await page.evaluate(() => window.textAudit.calls.filter(call => call.command === 'write_text_document').length), 0)
    interactions.push('文本编码弹层保留源码、未保存状态，不触发写入')
  }
  if (name === 'workspace') {
    await page.evaluate(() => { const tab = window.workflowAudit.store.tabs[0]; tab.content = '不能丢失的草稿'; tab.isDirty = true })
    await page.getByRole('button', { name: '命名保存…', exact: true }).click()
    await page.locator('#work-session-name').fill('界面审查现场')
    await page.getByRole('button', { name: '保存现场', exact: true }).click()
    await page.locator('#work-session-name').waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].content), '不能丢失的草稿')
    assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].isDirty), true)
    assert.ok((await page.locator('#work-session-choice').innerText()).includes('界面审查现场'))
    interactions.push('工作现场命名弹窗可保存；正文草稿与未保存标记保持')
  }
  if (name === 'quick-note') {
    await page.locator('textarea').fill('快速笔记的未保存内容')
    await page.getByRole('combobox', { name: '保存到', exact: true }).selectOption('__choose')
    await page.waitForFunction(() => !document.querySelector('textarea').disabled)
    assert.equal(await page.locator('textarea').inputValue(), '快速笔记的未保存内容')
    await page.getByRole('combobox', { name: '保存后操作', exact: true }).selectOption('continue')
    await page.evaluate(() => window.captureAudit.fail = true)
    await page.getByRole('button', { name: '保存笔记', exact: true }).click()
    await page.locator('.quick-note-window > p').filter({ hasText: '失败' }).waitFor()
    assert.equal(await page.locator('textarea').inputValue(), '快速笔记的未保存内容')
    await page.getByRole('button', { name: '保存笔记', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.quick-note-window > p')?.textContent.includes('已保存') && document.querySelector('textarea').value !== '快速笔记的未保存内容')
    assert.ok(await page.evaluate(() => Object.values(window.captureAudit.files).includes('快速笔记的未保存内容')))
    interactions.push('快速笔记失败保留正文；选择位置、重试保存、继续记录可用')
  }
  if (name === 'table') {
    for (const label of ['看板', '图表', '仪表盘', '表格']) {
      await page.locator('.view-tab-main').filter({ hasText: label }).click()
      assert.ok((await page.locator('.view-tab.active').innerText()).includes(label))
    }
    interactions.push('Table 的表格、看板、图表、仪表盘均可切换')
  }
  if (name === 'settings') {
    const navigation = page.locator('.settings-navigation button')
    for (let i = 0; i < await navigation.count(); i++) {
      const label = await navigation.nth(i).innerText(); await navigation.nth(i).click()
      assert.equal((await page.locator('.settings-category-heading h2').innerText()).trim(), label.trim())
    }
    await navigation.first().click()
    interactions.push('设置八个分类可切换且标题对应')
  }
}
async function checkSharedControls() {
  const page = await browser.newPage({ viewport: { width: 960, height: 700 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseUrl}/scripts/fixtures/ui-content-space-browser.html?mode=help`)
  const tooltip = page.locator('#longedit-app-tooltip')
  await page.getByTestId('help-outside').hover(); await tooltip.waitFor({ state: 'visible' })
  assert.equal(await tooltip.innerText(), '外侧操作说明')
  await page.keyboard.press('Escape'); await tooltip.waitFor({ state: 'hidden' })
  await page.getByTestId('help-outside').focus(); await tooltip.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await page.getByTestId('open-help-popover').click()
  await page.getByTestId('help-inside').hover(); await tooltip.waitFor({ state: 'visible' })
  assert.equal(await tooltip.innerText(), '弹层内操作说明')
  await page.locator('.n-base-selection').click()
  await page.locator('.n-base-select-menu').waitFor({ state: 'visible' })
  await page.getByTestId('help-inside').hover(); await page.waitForTimeout(550)
  assert.equal(await tooltip.isVisible(), false)
  await page.keyboard.press('Escape'); await page.mouse.click(800, 500)
  await page.getByTestId('open-help-menu').click()
  await page.locator('.n-dropdown-menu').waitFor({ state: 'visible' })
  await page.getByTestId('help-outside').hover(); await page.waitForTimeout(550)
  assert.equal(await tooltip.isVisible(), false)
  interactions.push('问号支持悬停、聚焦、Escape；弹层内可查看，选择及操作菜单打开时不遮挡')
  for (const mode of ['standalone', 'embedded']) {
    await page.goto(`${baseUrl}/scripts/fixtures/ui-content-space-browser.html?mode=${mode}`)
    await page.locator('.cm-content').waitFor()
    assert.equal(await page.locator('.workspace-tabs:visible').count(), 1)
    assert.equal(await page.locator('.workspace-file-name').isVisible(), mode === 'standalone')
    await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('接续草稿')
    await page.getByRole('button', { name: '编码与换行', exact: true }).click()
    await page.locator('.format-bar').waitFor({ state: 'visible' }); await page.locator('.cm-content').click()
    assert.ok((await page.locator('.cm-content').innerText()).includes('接续草稿'))
    assert.equal(await page.evaluate(() => window.uiSpaceAudit.calls.filter(call => call.command === 'write_text_document').length), 0)
  }
  interactions.push('独立、内嵌编辑器各只有一套标签栏；内嵌不重复文件名；草稿不写盘')
  await page.goto(`${baseUrl}/scripts/fixtures/text-redesign-browser.html?html`)
  await page.locator('.cm-content').waitFor()
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\n<p>未保存的网页预览</p>')
  await page.getByRole('button', { name: '安全预览', exact: true }).click()
  await page.frameLocator('iframe').getByText('未保存的网页预览', { exact: true }).waitFor()
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), '')
  await page.getByRole('button', { name: '源码', exact: true }).click()
  assert.ok((await page.locator('.cm-content').innerText()).includes('未保存的网页预览'))
  assert.equal(await page.evaluate(() => window.textAudit.calls.filter(call => call.command === 'write_text_document').length), 0)
  interactions.push('HTML 预览来自当前草稿，返回源码内容保留，切换不保存')
  assert.deepEqual(errors, [])
  await page.close()
}
async function openCase(item) {
  const [name, fixture, , route] = item
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  console.log(`Opening ${name}`)
  page.on('pageerror', error => errors.push(error.message))
  // Production uses a root index.html. Historical fixtures live two levels
  // deeper, so preserve the same local Vditor asset location for these tests.
  await page.route('**/scripts/fixtures/vditor/**', route => route.continue({ url: route.request().url().replace('/scripts/fixtures/vditor/', '/vditor/') }))
  await page.goto(`${baseUrl}/scripts/fixtures/${fixture}-browser.html${route?.startsWith('?') ? route : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  console.log(`DOM ready ${name}`)
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, { timeout: 120000 })
  if (route?.startsWith('/')) await page.evaluate(path => window.workflowAudit.router.push(path), route)
  await page.evaluate(async () => {
    document.querySelector('#app').style.width = '100%'
    const { installAppTooltipPolicy } = await import('/src/services/appTooltipPolicy.ts')
    if (!document.getElementById('longedit-app-tooltip')) installAppTooltipPolicy()
    await import('/src/styles/motion.scss')
  })
  if (name === 'library' || name === 'temp') await page.locator('.vditor-wysiwyg [contenteditable="true"]').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(700)
  console.log(`Mounted ${name}`)
  return { page, errors, name }
}
async function measure(page, item, style, narrow = false) {
  await page.setViewportSize(narrow ? { width: 760, height: 620 } : { width: 1440, height: 900 })
  await page.evaluate(async ({ style, narrow }) => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')
    store.visualStyle = style; store.theme = narrow ? 'dark' : 'white'; store.motionSpeed = 'calm'
    document.body.dataset.theme = narrow ? 'dark' : 'white'
    document.body.dataset.style = style; document.body.dataset.motion = 'calm'
    document.body.classList.toggle('is-dark', narrow)
    document.querySelector('#app').style.width = '100%'
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame)
  }, { style, narrow })
  return page.evaluate(selector => {
    const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0
    const primary = [...document.querySelectorAll(selector)].find(visible) || [...document.querySelectorAll('main, [class$="-stage"], [class$="-viewport"], .workspace-management-content')].find(visible)
    const rect = primary?.getBoundingClientRect()
    const headers = [...document.querySelectorAll('.workspace-document-header, .workspace-management-header')].filter(visible).map(el => Math.round(el.getBoundingClientRect().height))
    const malformedHelp = [...document.querySelectorAll('[data-workspace-help]')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return Math.abs(r.width - r.height) > 2 || r.height > 30 })
    return { primary: primary?.className || null, area: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null, headers, rootOverflow: document.documentElement.scrollWidth - innerWidth, malformedHelp: malformedHelp.length, helpCount: document.querySelectorAll('[data-workspace-help]').length, text: document.querySelector('#app').innerText.slice(0, 360) }
  }, item[2])
}
try {
  for (const item of selected) {
    const { page, errors, name } = await openCase(item)
    const rows = []
    for (const narrow of [false, true]) for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
      const metrics = await measure(page, item, style, narrow)
      assert.ok(metrics.area?.height > 80, `${name}: primary area missing`)
      assert.ok(metrics.rootOverflow <= 1, `${name}: page overflows viewport`)
      assert.equal(metrics.malformedHelp, 0, `${name}: help button is not round and compact`)
      rows.push({ style, narrow, ...metrics })
      if ((style === 'minimal' && !narrow) || (style === 'sharp' && narrow)) await page.screenshot({ path: resolve(output, `${name}-${style}${narrow ? '-narrow' : ''}.png`) })
    }
    reports.push({ name, baseline: false, rows, errors })
    await checkInteractions(page, name)
    await writeFile(interactionFile, JSON.stringify(interactions, null, 2))
    assert.deepEqual(errors, [], `${name}: unhandled page error`)
    await writeFile(matrixFile, JSON.stringify(reports, null, 2))
    await page.close()
    console.log(`${name}: ${rows.length} layouts; errors=${errors.length}; overflow=${Math.max(...rows.map(row => row.rootOverflow))}`)
  }
  assert.equal(reports.filter(row => !row.baseline).length, selected.length)
  await checkSharedControls()
  await writeFile(interactionFile, JSON.stringify(interactions, null, 2))
  console.log(`${interactions.length} interaction checks passed`)
  console.log(`Saved ${reports.length} page reports to ${output}`)
} finally { await browser.close() }
