import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-sidebar-resize'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const checks = [], movements = [], gutters = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  const editor = page.locator('.vditor-wysiwyg [contenteditable="true"]').first()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' draft retained')
  await page.waitForFunction(() => window.workflowAudit.store.tabs[0].isDirty && window.workflowAudit.store.tabs[0].content.includes('draft retained'))
  const draft = await page.evaluate(() => window.workflowAudit.store.tabs[0].content)
  const sidebar = page.locator('.sidebar'), handle = page.getByRole('separator', { name: '调整文件栏宽度', exact: true })
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame))
  const measure = () => page.evaluate(() => ({
    width: document.querySelector('.sidebar').getBoundingClientRect().width,
    divider: document.querySelector('.resizer-area').getBoundingClientRect().x,
    gutter: document.querySelector('.editor-main').getBoundingClientRect().left - document.querySelector('.sidebar').getBoundingClientRect().right,
    handleWidth: document.querySelector('.drag-handle').getBoundingClientRect().width,
    dragging: document.querySelector('.library-mode').classList.contains('is-dragging'),
    transition: getComputedStyle(document.querySelector('.sidebar')).transitionDuration,
  }))
  const start = async () => {
    const rect = await handle.boundingBox(), x = rect.x + rect.width / 2, y = rect.y + 60
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.waitForFunction(() => document.querySelector('.library-mode').classList.contains('is-dragging'))
    return { x, y }
  }
  for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
    await page.evaluate(style => { window.workflowAudit.store.visualStyle = style; window.workflowAudit.store.motionSpeed = 'calm' }, style)
    await handle.focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 260) < 0.1)
    const before = await measure()
    assert.equal(before.gutter, ['soft', 'glass', 'airy'].includes(style) ? 8 : 1, `${style}: use one compact gutter between the panels`)
    assert.equal(before.handleWidth, 17, `${style}: retain an easy-to-grab resize target`)
    gutters.push({ style, gap: before.gutter, dragTarget: before.handleWidth })
    const pointer = await start()
    for (const delta of [1, 32, 96, -32, 0]) {
      await page.mouse.move(pointer.x + delta, pointer.y)
      await frame()
      const current = await measure()
      assert.ok(Math.abs(current.width - before.width - delta) < 1, `${style}/${delta}: sidebar follows pointer displacement`)
      assert.ok(Math.abs(current.divider - before.divider - delta) < 1, `${style}/${delta}: divider follows pointer displacement`)
      assert.equal(current.transition, '0s')
      movements.push({ style, pointerDelta: delta, sidebarDelta: current.width - before.width, dividerDelta: current.divider - before.divider })
    }
    await page.mouse.up()
    const after = await measure()
    assert.equal(after.dragging, false)
    assert.notEqual(after.transition, '0s', 'Collapse/expand animation remains available after dragging')
    if (style === 'glass') {
      await handle.evaluate(element => element.blur())
      await page.mouse.move(800, 40)
      await page.screenshot({ path: `${output}/compact-gutter-glass.png`, animations: 'disabled' })
    }
  }
  checks.push('Card styles use an 8px gutter instead of 17px; flat styles retain a 1px separator and all styles retain the 17px drag target')
  checks.push('Six styles follow five pointer displacements within one frame without initial jumps; normal animations return after release')

  const pointer = await start()
  await page.mouse.move(pointer.x - 180, pointer.y)
  await frame()
  assert.equal((await measure()).width, 220)
  await page.mouse.move(pointer.x + 450, pointer.y)
  await frame()
  assert.equal((await measure()).width, 600)
  // Release over the title bar, outside LibraryMode's old mouseup listener.
  await page.mouse.move(20, 16)
  await page.mouse.up()
  assert.equal((await measure()).dragging, false)
  assert.equal((await measure()).width, 220)
  checks.push('Bounds remain 220–600px; pointer capture completes a drag released outside the library shell')

  await handle.evaluate(element => element.addEventListener('pointerdown', event => { window.resizePointerId = event.pointerId }, { once: true }))
  const cancelPointer = await start()
  await page.mouse.move(cancelPointer.x + 80, cancelPointer.y)
  await frame()
  await handle.evaluate(element => element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.resizePointerId, bubbles: true })))
  assert.equal((await measure()).dragging, false)
  assert.equal((await measure()).width, 300)
  await page.mouse.up()
  const blurPointer = await start()
  await page.mouse.move(blurPointer.x + 20, blurPointer.y)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  assert.equal((await measure()).dragging, false)
  assert.equal((await measure()).width, 320)
  await page.mouse.up()
  checks.push('Pointer cancellation and window focus loss end dragging at the last width')

  await handle.focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await handle.getAttribute('aria-valuenow'), '310')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 260) < 0.1)
  await page.locator('.collapse-btn.left').click()
  await page.waitForFunction(() => document.querySelector('.sidebar').getAttribute('aria-hidden') === 'true' && document.querySelector('.sidebar').getBoundingClientRect().width <= 2)
  await page.locator('.collapse-btn.left').click()
  await page.waitForFunction(() => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 260) < 0.1)
  assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].content), draft)
  assert.equal(await page.evaluate(() => window.workflowAudit.store.tabs[0].isDirty), true)
  checks.push('Keyboard adjustment, collapse/reopen and the unsaved document draft remain intact')

  // Count parent updates after the initial drag state update, rather than asserting
  // an unreliable FPS threshold affected by the machine's concurrent workload.
  await page.evaluate(() => {
    const component = document.querySelector('.library-mode').__vueParentComponent
    window.resizeParentUpdates = 0
    ;(component.u ||= []).push(() => { window.resizeParentUpdates++ })
  })
  await page.mouse.move(800, 500)
  await page.mouse.move(800, 520)
  await frame()
  assert.equal(await page.evaluate(() => window.resizeParentUpdates), 0)
  const smoothPointer = await start()
  await frame()
  await page.evaluate(() => { window.resizeParentUpdates = 0 })
  await page.mouse.move(smoothPointer.x + 100, smoothPointer.y, { steps: 20 })
  await frame()
  assert.equal(await page.evaluate(() => window.resizeParentUpdates), 0)
  await page.mouse.up()
  checks.push('Idle mouse movement and drag frames do not rerender the parent file-tree/editor component')
  await page.screenshot({ path: `${output}/after-drag.png`, animations: 'disabled' })

  // A long press on a file should still place its ghost beside the pointer even
  // when it has not moved yet. Release without a drop target to avoid file writes.
  const row = page.locator('.library-file-tree .n-tree-node[data-drop-path="C:/workflow-fixture/项目方案.md"]')
  const rowRect = await row.boundingBox(), ghostX = rowRect.x + rowRect.width / 2, ghostY = rowRect.y + rowRect.height / 2
  await page.mouse.move(ghostX, ghostY)
  await page.mouse.down()
  await page.locator('.drag-ghost').waitFor()
  const ghost = await page.locator('.drag-ghost').boundingBox()
  assert.ok(Math.abs(ghost.x - ghostX - 10) < 1 && Math.abs(ghost.y - ghostY - 10) < 1)
  await page.mouse.up()
  await page.locator('.drag-ghost').waitFor({ state: 'hidden' })
  checks.push('Existing file long-press dragging keeps its ghost at the pointer without changing files')

  await page.setViewportSize({ width: 736, height: 820 })
  await page.evaluate(() => { window.workflowAudit.store.visualStyle = 'soft' })
  await page.waitForFunction(() => document.body.dataset.style === 'soft' && document.querySelector('.sidebar').getAttribute('aria-hidden') === 'true' && document.querySelector('.sidebar').getBoundingClientRect().width <= 2)
  assert.equal(await handle.isVisible(), false)
  const editorFillsWidth = () => page.evaluate(() => {
    const workspace = document.querySelector('.library-workspace'), style = getComputedStyle(workspace)
    return Math.abs(document.querySelector('.editor-main').getBoundingClientRect().width - (workspace.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))) < 1
  })
  assert.equal(await editorFillsWidth(), true)
  await page.getByRole('button', { name: '导航', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.sidebar').getAttribute('aria-hidden') === 'false' && Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 360) < 0.1)
  assert.equal(await editorFillsWidth(), true)
  await page.getByRole('button', { name: '导航', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.sidebar').getAttribute('aria-hidden') === 'true')
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.waitForFunction(() => document.querySelector('.sidebar').getAttribute('aria-hidden') === 'false' && Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 360) < 0.1)
  checks.push('Narrow windows keep navigation in an overlay and let the editor fill the available width; reopening does not reserve a gutter')

  const finalPointer = await start()
  await page.mouse.move(finalPointer.x + 20, finalPointer.y)
  await page.evaluate(() => window.workflowAudit.router.push('/'))
  await page.mouse.up()
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  assert.equal((await measure()).dragging, false)
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => window.workflowAudit.calls.filter(call => call.command.startsWith('write_') || call.command === 'move_items')), [])
  checks.push('Leaving the page cancels pointer capture and pending resize frames')
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ checks, movements, gutters, errors, scope: 'Production App/LibraryMode/Vditor with mock native IPC; actual browser pointer capture and layout. No native performance benchmark.' }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, measurements: movements.length, errors }))
} finally { await browser.close() }
