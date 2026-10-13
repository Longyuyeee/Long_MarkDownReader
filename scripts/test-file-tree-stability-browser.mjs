import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const recording = process.argv.includes('--baseline')
const output = 'docs/evidence/v110-file-tree-stability'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch(), errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.locator('.library-file-tree').waitFor()
  await page.evaluate(() => {
    const s = window.workflowAudit.store
    s.theme = 'dark'; s.visualStyle = 'soft'; s.motionSpeed = 'calm'
    s.fileDisplayStyles = { 'C:/workflow-fixture/会议记录.md': { backgroundColor: '#eee3ff', textColor: '#253041', icon: 'note', selectionStyle: 'outline' } }
    window.workflowAudit.disk.set('C:/workflow-fixture/Inbox/参考资料/采访.md', '# 采访')
  })
  await page.waitForTimeout(450)
  const row = page.locator('[data-drop-path="C:/workflow-fixture/会议记录.md"]')
  const inspect = () => row.evaluate(el => {
    const background = getComputedStyle(el).backgroundColor
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    context.fillStyle = background; context.fillRect(0, 0, 1, 1)
    return { background, backgroundAlpha: context.getImageData(0, 0, 1, 1).data[3], height: el.getBoundingClientRect().height, connected: el.isConnected }
  })
  await row.hover(); await page.waitForTimeout(250)
  const hovered = await inspect()
  await page.mouse.down(); await page.waitForTimeout(80)
  const pressed = await inspect()
  await page.mouse.up(); await page.waitForTimeout(320)
  const selected = await inspect()
  if (!recording) {
    assert.equal(pressed.backgroundAlpha, 255, 'Custom row must stay opaque when pressed')
    assert.equal(selected.background, 'rgb(238, 227, 255)')
    assert.equal(hovered.height, pressed.height)
    assert.equal(pressed.height, selected.height)
  }
  const frames = []
  const record = async expand => {
    await page.evaluate(() => {
      window.treeFrames = []; window.treeFramesDone = false
      const start = performance.now()
      function sample(now) {
        const row = document.querySelector('[data-drop-path="C:/workflow-fixture/会议记录.md"]')
        const folder = document.querySelector('[data-drop-path="C:/workflow-fixture/Inbox"]')
        const wrapper = document.querySelector('.n-tree-motion-wrapper')
        window.treeFrames.push({ ms: Math.round(now - start), y: row.getBoundingClientRect().y, folderY: folder.getBoundingClientRect().y, wrapperHeight: wrapper?.getBoundingClientRect().height ?? null })
        if (now - start < 600) requestAnimationFrame(sample)
        else window.treeFramesDone = true
      }
      requestAnimationFrame(sample)
    })
    await page.locator('[data-drop-path="C:/workflow-fixture/Inbox"] .n-tree-node-switcher').click()
    await page.waitForFunction(() => window.treeFramesDone)
    const samples = await page.evaluate(() => window.treeFrames)
    frames.push({ expand, samples })
    if (!recording) {
      assert.ok(Math.max(...samples.map(f => f.folderY)) - Math.min(...samples.map(f => f.folderY)) <= .5, 'Parent row must stay anchored')
      for (let i = 1; i < samples.length; i++) {
        const delta = samples[i].y - samples[i - 1].y
        assert.ok(expand ? delta >= -.5 : delta <= .5, `Rows must move in one direction, without jumping back: ${delta}`)
      }
    }
  }
  await record(true)
  await page.locator('[data-drop-path="C:/workflow-fixture/Inbox/参考资料"] .n-tree-node-switcher').click()
  await page.getByText('采访.md', { exact: true }).waitFor()
  await page.waitForTimeout(350)
  if (!recording) {
    const hierarchy = await page.locator('.library-file-tree .n-tree-node').evaluateAll(nodes => nodes.filter(el => ['Inbox', '参考资料', '采访.md'].includes(el.textContent.trim())).map(el => ({ label: el.textContent.trim(), depth: el.dataset.treeDepth, x: el.querySelector('.n-tree-node-content__text').getBoundingClientRect().x, guides: el.querySelectorAll('.n-tree-node-indent--show-line').length })))
    assert.deepEqual(hierarchy.map(node => node.depth), ['0', '1', '2'])
    assert.ok(hierarchy[1].x > hierarchy[0].x && hierarchy[2].x > hierarchy[1].x)
    assert.ok(hierarchy[2].guides >= 1)
  }
  await page.locator('.sidebar').screenshot({ path: output + (recording ? '/before.png' : '/after.png'), animations: 'disabled' })
  await page.locator('[data-drop-path="C:/workflow-fixture/Inbox/参考资料"] .n-tree-node-switcher').click()
  await page.waitForTimeout(350)
  await record(false)
  if (!recording) {
    for (const style of ['neo', 'glass', 'airy', 'minimal', 'sharp']) {
      await page.evaluate(style => { window.workflowAudit.store.visualStyle = style }, style)
      await page.waitForTimeout(300)
      await record(true); await record(false)
    }
    for (const density of ['compact', 'spacious']) {
      await page.evaluate(density => { window.workflowAudit.store.displayPreferences.fileDensity = density }, density)
      await page.waitForTimeout(300)
      await record(true); await record(false)
    }
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(output + (recording ? '/baseline.json' : '/results.json'), JSON.stringify({ hovered, pressed, selected, frames, errors, scope: 'Actual Vue/Naive tree, mocked native IPC; browser mouse and frame geometry.' }, null, 2) + '\n')
  console.log(JSON.stringify({ hovered, pressed, selected, motion: frames.map(({ expand, samples }) => ({ expand, parentRange: Math.max(...samples.map(f => f.folderY)) - Math.min(...samples.map(f => f.folderY)), reversals: samples.slice(1).map((f, i) => f.y - samples[i].y).filter(d => expand ? d < -.5 : d > .5) })) }))
} finally { await browser.close() }
