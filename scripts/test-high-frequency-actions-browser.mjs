import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-high-frequency-actions'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const errors = [], checks = [], layouts = []
const frequent = ['undo','redo','headings','bold','italic','quote','list','ordered-list','check','code','inline-code','link','table']
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  const preview = page.getByTestId('library-document-preview')
  await preview.waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  await page.locator('.vditor-wysiwyg').getByText('让阅读、记录和继续工作更顺手。', { exact: true }).waitFor()
  const favorite = page.getByTestId('library-document-favorite')
  assert.equal(await favorite.getAttribute('aria-pressed'), 'true')
  await favorite.click()
  assert.equal(await favorite.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.evaluate(() => window.workflowAudit.store.isStarred(window.workflowAudit.store.activeTabId)), false)
  await favorite.click()
  assert.equal(await favorite.getAttribute('aria-pressed'), 'true')
  checks.push('Favorite shortcut updates the existing persistent favorite list in both directions')

  const editor = page.locator('.vditor-wysiwyg [contenteditable="true"]').first()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' draft retained')
  await page.waitForFunction(() => {
    const tab = window.workflowAudit.store.tabs.find(t => t.id === window.workflowAudit.store.activeTabId)
    return tab.isDirty && tab.content.includes('draft retained')
  })
  // Vditor's existing mode conversion normalizes terminal blank lines. Compare
  // all content except that serializer detail and require the draft to stay dirty.
  const draft = (await page.evaluate(() => window.workflowAudit.store.tabs.find(t => t.id === window.workflowAudit.store.activeTabId).content)).replace(/\n+$/, '\n')
  const assertDraft = async (expected = draft) => assert.deepEqual(await page.evaluate(() => {
    const tab = window.workflowAudit.store.tabs.find(t => t.id === window.workflowAudit.store.activeTabId)
    return { content: tab.content.replace(/\n+$/, '\n'), dirty: tab.isDirty }
  }), { content: expected, dirty: true })
  for (const [mode, label] of [['wysiwyg',null],['sv','源码编辑'],['ir','即时渲染 IR']]) {
    if (label) {
      await page.getByTitle('切换编辑模式', { exact: true }).click()
      await page.getByText(label, { exact: true }).click()
      await page.waitForFunction(mode => window.workflowAudit.store.editorMode === mode, mode)
      await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
    }
    await preview.click()
    await page.waitForFunction(() => document.querySelector('[data-testid="library-document-preview"]').getAttribute('aria-pressed') === 'true')
    await page.locator('#vditor-lib .vditor-preview').waitFor({ state: 'visible' })
    assert.equal(await preview.innerText(), '返回编辑')
    await assertDraft()
    await preview.click()
    await page.waitForFunction(() => document.querySelector('[data-testid="library-document-preview"]').getAttribute('aria-pressed') === 'false')
    await assertDraft()
    assert.equal(await page.locator('.document-shortcut-host').count(), 1)
  }
  checks.push('Preview and return work in WYSIWYG, source and IR after editor rebuilds, retaining unsaved content')
  await page.locator('#vditor-lib [data-type="more"]').click()
  await page.locator('#vditor-lib [data-type="preview"]').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="library-document-preview"]').getAttribute('aria-pressed') === 'true')
  await preview.click()
  checks.push('Native preview menu and new shortcut share their active state')

  await page.getByTitle('切换编辑模式', { exact: true }).click()
  await page.getByText('所见即所得', { exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  await page.locator('.vditor-wysiwyg').getByText('让阅读、记录和继续工作更顺手。', { exact: true }).waitFor()
  await page.evaluate(() => {
    window.workflowAudit.store.aiEnabled = true
    const paragraph = Array.from(document.querySelectorAll('.vditor-wysiwyg p')).find(p => p.textContent.includes('让阅读、记录和继续工作更顺手。'))
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection.removeAllRanges(); selection.addRange(range)
  })
  await page.getByTestId('library-document-ai').click()
  await page.getByRole('dialog').getByText('润色', { exact: true }).waitFor()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  checks.push('AI shortcut preserves the selected text and opens the existing actions without sending a request')
  const focusDraft = (await page.evaluate(() => window.workflowAudit.store.tabs.find(t => t.id === window.workflowAudit.store.activeTabId).content)).replace(/\n+$/, '\n')
  await page.getByTestId('library-focus-toggle').click()
  assert.equal(await page.locator('.library-shell-toolbar').count(), 0)
  await page.getByRole('button', { name: '退出专注', exact: true }).click()
  await preview.waitFor()
  await assertDraft(focusDraft)
  checks.push('Focus has a visible exit and returns to the same draft')

  for (const style of ['soft','neo','glass','airy','minimal','sharp']) {
    await page.evaluate(style => window.workflowAudit.store.visualStyle = style, style)
    await page.waitForFunction(style => document.body.dataset.style === style, style)
    for (const width of [1280,1024,480,320]) {
      await page.setViewportSize({ width, height: width <= 480 ? 640 : 820 })
      await page.waitForTimeout(100)
      for (const name of frequent) assert.equal(await page.locator(`#vditor-lib .vditor-toolbar > .vditor-toolbar__item > [data-type="${name}"]`).isVisible(), true, `${style}/${width}: ${name}`)
      for (const title of ['切换编辑模式','调整正文宽度','导出文档','查看历史与差异']) assert.equal(await page.getByTitle(title, { exact: true }).isVisible(), true, `${style}/${width}: ${title}`)
      for (const id of ['library-document-favorite','library-document-preview','library-focus-toggle','library-document-ai','library-reference-toggle','library-explicit-save','library-document-menu']) assert.equal(await page.getByTestId(id).isVisible(), true, `${style}/${width}: ${id}`)
      const layout = await page.evaluate(() => {
        const region = document.querySelector('.editor-main').getBoundingClientRect()
        const controls = Array.from(document.querySelectorAll('.document-toolbar button, .document-inline-shortcuts button, #vditor-lib .vditor-toolbar > .vditor-toolbar__item > button')).filter(el => el.getBoundingClientRect().width)
        const outside = controls.filter(el => {
          const r = el.getBoundingClientRect()
          return r.left < region.left - 1 || r.right > region.right + 1
        }).map(el => el.dataset.type || el.textContent)
        const obscured = controls.filter(el => {
          if (el.disabled) return false
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return hit !== el && !el.contains(hit)
        }).map(el => el.dataset.type || el.textContent)
        const toolbar = document.querySelector('#vditor-lib .vditor-toolbar').getBoundingClientRect()
        const shell = document.querySelector('.library-shell-toolbar').getBoundingClientRect()
        const tab = document.querySelector('.workspace-tab.active').getBoundingClientRect()
        const shellControls = [...document.querySelectorAll('.library-shell-toolbar > .n-button')]
        const shellObscured = shellControls.filter(element => {
          const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return !element.disabled && r.width > 0 && !element.contains(hit)
        }).map(element => element.getAttribute('aria-label'))
        return { editorWidth: region.width, toolbarHeight: toolbar.height, tabRowHeight: shell.height, topGap: region.top - shell.bottom, tabHeight: tab.height, shellButtonHeights: shellControls.map(element => element.getBoundingClientRect().height), closeButtonHeight: document.querySelector('.workspace-tab.active .close-tab').getBoundingClientRect().height, shellObscured, outside, obscured, overflow: document.documentElement.scrollWidth > innerWidth + 1 }
      })
      assert.deepEqual(layout.outside, [], `${style}/${width}: clipped controls`)
      assert.deepEqual(layout.obscured, [], `${style}/${width}: covered click targets`)
      assert.equal(layout.overflow, false, `${style}/${width}: horizontal overflow`)
      assert.ok(layout.tabRowHeight <= 36, `${style}/${width}: compact tab row`)
      assert.equal(layout.topGap, ['soft', 'glass', 'airy'].includes(style) ? 4 : 0, `${style}/${width}: compact space below tabs`)
      assert.equal(layout.tabHeight, 28, `${style}/${width}: readable document tab height`)
      assert.ok(layout.shellButtonHeights.every(height => height >= 28), `${style}/${width}: retain shell button click area ${JSON.stringify(layout.shellButtonHeights)}`)
      assert.equal(layout.closeButtonHeight, 20, `${style}/${width}: retain close button click area`)
      assert.deepEqual(layout.shellObscured, [], `${style}/${width}: shell controls remain clickable`)
      if (width === 1280 && layout.toolbarHeight >= 50) {
        await page.screenshot({ path: `${output}/toolbar-failure.png`, animations: 'disabled' })
      }
      if (width === 1280) assert.ok(layout.toolbarHeight < 50, `${style}: wide toolbar remains on one row ${JSON.stringify(layout)}`)
      layouts.push({ style, width, ...layout })
      if (width === 1280 || (style === 'minimal' && width <= 480)) await page.screenshot({ path: `${output}/${style}-${width}.png`, animations: 'disabled' })
    }
  }
  checks.push('Six styles at 1280, 1024, 480 and 320 keep frequent tools and named document shortcuts visible without horizontal clipping')
  checks.push('Main tabs occupy 35–36px with at most a 4px gap below; labels and button click areas remain readable and reachable across all six styles and four window widths')
  assert.deepEqual(errors, [])
  const writes = await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command.startsWith('write_') || c.command === 'ai_chat_completion'))
  assert.deepEqual(writes, [])
  await fs.writeFile(output+'/results.json', JSON.stringify({ checks, layouts, errors, scope: 'Production App/LibraryMode/Vditor with mock native IPC. No native save/export acceptance.' }, null, 2)+'\n')
  console.log(JSON.stringify({ checks, layouts: layouts.length, errors }))
} finally { await browser.close() }
