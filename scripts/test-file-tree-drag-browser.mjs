import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-file-tree-drag'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined, headless: true })
const checks = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/workflow-redesign-browser.html')
  await page.evaluate(() => {
    const a = window.workflowAudit, original = window.__TAURI_INTERNALS__.invoke
    a.orders = new Map()
    a.disk.set('C:/workflow-fixture/.misty_order.json', '{}')
    a.disk.set('C:/workflow-fixture/.settings.json', '{}')
    a.disk.set('C:/workflow-fixture/settings.json', '{}')
    a.disk.set('C:/workflow-fixture/Inbox/.misty_order.json', '{}')
    a.store.visualStyle = 'glass'; a.store.motionSpeed = 'calm'
    a.store.fileDisplayStyles = { 'C:/WORKFLOW-fixture\\项目方案.md': { backgroundColor: '#dceeff', icon: 'rocket', selectionStyle: 'outline', selectedTextColor: '#176b45', selectedAccentColor: '#176b45' } }
    window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (command === 'move_items') {
        a.calls.push({ command, args })
        await new Promise(resolve => setTimeout(resolve, 160))
        for (const source of args.sourcePaths) for (const [path, content] of [...a.disk]) {
          if (path === source || path.startsWith(source + '/')) {
            const next = args.targetDir + '/' + source.split('/').pop() + path.slice(source.length)
            a.disk.delete(path); a.disk.set(next, content)
          }
        }
        return
      }
      if (command === 'get_folder_order') { a.calls.push({ command, args }); return a.orders.get(args.path) || { items: [], pinned: [] } }
      if (command === 'save_folder_order') {
        a.calls.push({ command, args }); a.orders.set(args.path, args.order)
        a.disk.set(args.path + '/.misty_order.json', JSON.stringify(args.order)); return
      }
      if (command === 'scan_directory') {
        const entries = await original(command, args), order = a.orders.get(args.path)
        if (!order) return entries
        const names = [...new Set([...order.pinned, ...order.items])]
        return [...names.map(name => entries.find(entry => entry.name === name)).filter(Boolean), ...entries.filter(entry => !names.includes(entry.name))]
      }
      return original(command, args)
    }
  })
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  const tree = page.locator('.library-file-tree'), ghost = page.locator('.drag-ghost')
  const row = path => tree.locator(`.n-tree-node[data-drop-path="C:/workflow-fixture/${path}"]`)
  await row('项目方案.md').waitFor()
  assert.equal(await tree.getByText('.misty_order.json', { exact: true }).count(), 0)
  assert.equal(await tree.getByText('.settings.json', { exact: true }).isVisible(), true)
  assert.equal(await tree.getByText('settings.json', { exact: true }).isVisible(), true)
  await row('Inbox').locator('.n-tree-node-switcher').click()
  await row('Inbox/灵感.md').waitFor()
  assert.equal(await tree.getByText('.misty_order.json', { exact: true }).count(), 0)
  checks.push('Root and nested internal ordering files are hidden; legitimate JSON and dotfiles remain visible')

  await row('会议记录.md').locator('.n-tree-node-content').click()
  await row('项目方案.md').locator('.n-tree-node-content').click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="library-document-preview"]').disabled)
  await page.locator('.vditor-wysiwyg [contenteditable="true"]').first().click()
  await page.keyboard.press('Control+End'); await page.keyboard.type(' draft retained')
  await page.waitForFunction(() => window.workflowAudit.store.tabs.find(t => t.title === '项目方案.md').content.includes('draft retained'))
  const draft = await page.evaluate(() => window.workflowAudit.store.tabs.find(t => t.title === '项目方案.md').content)
  const begin = async source => {
    const rect = await row(source).boundingBox()
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.mouse.down()
    return rect
  }
  const over = async (target, ratio = .5) => {
    const rect = await row(target).boundingBox()
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * ratio)
    await page.evaluate(() => new Promise(requestAnimationFrame))
    return rect
  }
  await begin('项目方案.md')
  const target = await over('Inbox')
  await ghost.getByText('移入「Inbox」', { exact: true }).waitFor()
  assert.equal(await row('Inbox').evaluate(element => element.classList.contains('is-drop-inside')), true)
  assert.equal(await row('Inbox').evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(37, 99, 235)', 'Drop styling takes precedence over ordinary hover styling')
  await page.evaluate(() => {
    const instance = document.querySelector('.library-mode').__vueParentComponent
    window.fileDragUpdates = 0; (instance.u ||= []).push(() => { window.fileDragUpdates++ })
  })
  for (let step = 0; step < 12; step++) {
    await page.mouse.move(target.x + target.width / 2 + step % 2, target.y + target.height / 2)
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  assert.equal(await page.evaluate(() => window.fileDragUpdates), 0)
  await page.waitForTimeout(650)
  assert.equal(await page.locator('#file-tree-detail-preview').count(), 0)
  assert.equal(await row('Inbox').evaluate(element => getComputedStyle(element).transitionDuration), '0s')
  await page.screenshot({ path: `${output}/folder-target.png`, animations: 'disabled' })
  await page.mouse.up()
  await ghost.waitFor({ state: 'hidden' })
  await row('Inbox/项目方案.md').waitFor()
  await page.waitForFunction(() => window.workflowAudit.calls.some(c => c.command === 'save_folder_order'))
  const moved = await page.evaluate(() => {
    const a = window.workflowAudit, tab = a.store.tabs.find(t => t.path === 'C:/workflow-fixture/Inbox/项目方案.md')
    return { path: tab.path, content: tab.content, dirty: tab.isDirty, starred: [...a.store.starredFiles], style: a.store.fileDisplayStyleForPath(tab.path), order: a.orders.get('C:/workflow-fixture/Inbox') }
  })
  assert.equal(moved.path, 'C:/workflow-fixture/Inbox/项目方案.md')
  assert.equal(moved.content, draft); assert.equal(moved.dirty, true)
  assert.ok(moved.starred.includes(moved.path)); assert.equal(moved.style.icon, 'rocket')
  assert.equal(moved.style.selectionStyle, 'outline')
  assert.equal(moved.style.selectedTextColor, '#176b45')
  assert.ok(!moved.order.items.includes('.misty_order.json'))
  assert.equal(await tree.getByText('.misty_order.json', { exact: true }).count(), 0)
  await page.screenshot({ path: `${output}/after-move.png`, animations: 'disabled' })
  checks.push('Folder feedback is explicit and stable without preview popups or parent rerenders; moving keeps drafts, favorites, file markers and expanded destination contents')
  const movedIcon = await row('Inbox/项目方案.md').locator('.n-tree-node-content__prefix svg').innerHTML()
  for (const preset of ['forest-green', 'tech-blue', 'ocean-glass', 'cream-airy', 'professional-light', 'sharp-business', 'professional-dark']) {
    await page.evaluate(preset => window.workflowAudit.store.applyThemePreset(preset), preset)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.library-file-tree .has-file-display-style.n-tree-node--selected')).backgroundColor === 'rgb(220, 238, 255)')
    const presentation = await row('Inbox/项目方案.md').evaluate(element => ({ color: getComputedStyle(element).color, border: getComputedStyle(element).borderColor, iconStroke: getComputedStyle(element.querySelector('.n-tree-node-content__prefix svg')).stroke }))
    assert.equal(presentation.color, 'rgb(23, 107, 69)')
    assert.equal(presentation.border, 'rgb(23, 107, 69)')
    assert.equal(presentation.iconStroke, 'rgb(23, 107, 69)')
    assert.equal(await row('Inbox/项目方案.md').locator('.n-tree-node-content__prefix svg').innerHTML(), movedIcon)
  }
  checks.push('Legacy mixed-case/backslash marker keys survive moving; seven theme presets retain the exact custom background, selected text/border and new icon')

  const movesBefore = await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'move_items').length)
  await begin('会议记录.md'); await over('settings.json', .7)
  await ghost.getByText('放到「settings.json」后', { exact: true }).waitFor()
  await page.mouse.up()
  await ghost.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.workflowAudit.orders.has('C:/workflow-fixture'))
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'move_items').length), movesBefore)
  const order = await page.evaluate(() => window.workflowAudit.orders.get('C:/workflow-fixture').items)
  assert.ok(order.indexOf('会议记录.md') > order.indexOf('settings.json'))
  assert.ok(!order.includes('.misty_order.json'))
  assert.ok((await row('会议记录.md').boundingBox()).y > (await row('settings.json').boundingBox()).y)
  checks.push('Dropping on a file sorts within its parent instead of treating a file as a directory')

  await begin('会议记录.md'); await over('Inbox/参考资料')
  await ghost.getByText('移入「参考资料」', { exact: true }).waitFor()
  await row('Inbox/参考资料/调研.md').waitFor()
  await over('Inbox/参考资料')
  assert.equal(await ghost.getByText('移入「参考资料」', { exact: true }).isVisible(), true)
  await page.keyboard.press('Escape'); await page.mouse.up()
  await ghost.waitFor({ state: 'hidden' })
  checks.push('Hovering a folder loads its children before expanding; target feedback remains stable and Escape cancels')

  await begin('Inbox'); await over('Inbox/参考资料')
  await ghost.getByText('不能放到自身或子文件夹中', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/invalid-target.png`, animations: 'disabled' })
  await page.mouse.up(); await ghost.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.workflowAudit.calls.filter(c => c.command === 'move_items').length), movesBefore)
  await begin('会议记录.md')
  await page.mouse.move(850, 500)
  await ghost.waitFor()
  await page.mouse.move(20, 16); await page.mouse.up()
  await ghost.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.library-mode').evaluate(element => element.classList.contains('file-dragging')), false)
  checks.push('Invalid destinations and release outside the file pane do not move files or leave stale highlights')
  assert.deepEqual(errors, [])
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, scope: 'Production App/LibraryMode/Vditor. Mock IPC performs in-memory moves and order writes only; no user files modified.' }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, errors }))
} finally { await browser.close() }
