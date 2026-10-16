import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v116-specialized-save-coordination/browser'
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined })
const checks = [], layouts = [], errors = []
let page
const settled = async () => page.waitForFunction(() => !document.querySelector('.n-message') &&
  !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity))
try {
  for (const editor of ['canvas', 'diagram', 'mindmap']) {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push({ editor, message: error.message }))
    await page.goto(`${base}/scripts/fixtures/specialized-save-browser.html?editor=${editor}`)
    await page.waitForFunction(() => Boolean(window.specializedSaveAudit))
    let field, save
    if (editor === 'canvas') {
      await page.locator('.canvas-edge text').first().click()
      field = page.getByPlaceholder('例如：支持、依赖于…')
      save = page.getByRole('button', { name: '保存', exact: true })
    } else if (editor === 'diagram') {
      field = page.getByRole('textbox', { name: 'Mermaid 源码', exact: true })
      save = page.getByRole('button', { name: '保存', exact: true })
    } else {
      await page.locator('.map-node').first().click()
      field = page.getByPlaceholder('补充描述、上下文或行动说明')
      save = page.getByTitle('保存', { exact: true })
    }
    const text = editor === 'diagram' ? 'flowchart LR\n A[我还没写完的内容] --> B[不要丢失]' : '我还没写完的内容，不要丢失'
    await field.fill(text)
    await field.press('Tab')
    await save.waitFor()
    await page.waitForFunction(() => window.specializedSaveAudit.draftCount > 0)
    assert.equal(await page.evaluate(() => window.specializedSaveAudit.writes.length), 0, 'editing must not autosave')
    await save.click()
    await page.getByText(/文档正在保存或整理，请保留修改并稍后重试/).first().waitFor()
    assert.equal(await field.inputValue(), text, 'rejected save must retain the actual user input')
    assert.ok(await page.evaluate(() => window.specializedSaveAudit.draftCount > 0), 'rejected save must retain close protection')
    assert.equal(await save.isEnabled(), true, 'user must be able to retry after the native reservation ends')
    assert.equal(await page.evaluate(() => window.specializedSaveAudit.saved), null)
    checks.push(`${editor}: actual user edit does not autosave; rejected save preserves input and draft guard`)
    for (const width of [1280, 480]) for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(style => {
        window.specializedSaveAudit.store.visualStyle = style
        document.body.dataset.style = style
        document.documentElement.dataset.style = style
      }, style)
      await settled()
      await save.scrollIntoViewIfNeeded()
      await save.click({ trial: true })
      assert.equal(await field.inputValue(), text)
      layouts.push({ editor, width, style, draftRetained: true, retryReachable: true, motion: 'calm' })
    }
    await page.screenshot({ path: `${output}/${editor}-narrow.png` })
    await page.setViewportSize({ width: 1280, height: 900 })
    await settled()
    await page.screenshot({ path: `${output}/${editor}-wide.png` })
    await page.evaluate(() => { window.specializedSaveAudit.blocked = false })
    await save.click()
    await page.waitForFunction(() => window.specializedSaveAudit.saved !== null && window.specializedSaveAudit.draftCount === 0)
    const writes = await page.evaluate(() => window.specializedSaveAudit.writes)
    assert.equal(writes.length, 2, 'only the two explicit saves may write')
    assert.equal(writes[0].blocked, true)
    assert.equal(writes[1].blocked, false)
    assert.deepEqual(writes[1].args, writes[0].args, 'retry must submit the preserved draft, not a reloaded/empty document')
    checks.push(`${editor}: explicit retry submits the unchanged draft once and clears dirty only after success`)
    await page.close()
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(`${output}/results.json`, JSON.stringify({
    scope: 'Actual Vue CanvasView/DiagramStudio/MindMapView and user input; isolated native responses, not native filesystem, multi-window freeze or installed evidence',
    checks, layouts, errors,
  }, null, 2) + '\n')
  console.log(`Specialized save continuity passed: ${checks.length} checks, ${layouts.length} layouts, ${errors.length} page errors`)
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
