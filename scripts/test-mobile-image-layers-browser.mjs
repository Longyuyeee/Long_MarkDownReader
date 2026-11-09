import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline'), output = process.env.LONGEDIT_IMAGE_LAYERS_OUTPUT || `docs/evidence/mobile-0.1.0/image-layers-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(path.join(output, '.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'mobile-image-review-and-return', baseline, nativeAndroidTest: false, checks: [], errors: [], scans: [] }
const stateKey = 'longedit-mobile-preview-v1', key = JSON.stringify(['local', '行程笔记.md'])
const original = '# 行程笔记\r\n\r\n原始内容。\r\n', candidate = '# 行程笔记\n\n保留未保存输入。\n\n![路线图](attachments/existing.png)\n![车票](missing.png)\n![车票副本](missing.png)\n'
const png = await readFile('release-artifacts/mobile-attachment-fixture/picker/diagram.png')
const changedImage = await readFile('release-artifacts/mobile-attachment-fixture/picker/photo.jpg')
let page
const button = name => page.getByRole('button', { name, exact: typeof name === 'string' })
const data = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), stateKey)
const draft = state => { const { updated, ...value } = state.drafts[key]; return value }
const back = async () => { await page.evaluate(() => window.__longeditMobileBack()); await page.waitForTimeout(80) }
const shot = name => page.screenshot({ path: path.join(output, name + '.png') })
async function pick() { const event = page.waitForEvent('filechooser'); await button('选择图片').tap(); await (await event).setFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: png }) }
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const violations = await page.evaluate(async () => (await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })))
  report.scans.push({ name, violations }); assert.deepEqual(violations, [], name)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(({ stateKey, key, original, image }) => {
    if (window !== window.top) return
    if (!localStorage.getItem(stateKey)) {
      const record = { id: 'existing', rootId: 'local', notePath: '行程笔记.md', name: 'existing.png', status: 'ready', imagePath: 'attachments/existing.png', width: 320, height: 200, bytes: image.bytes, created: 1, error: '', attempts: 1 }
      localStorage.setItem(stateKey, JSON.stringify({ version: 1, documents: { [key]: { rootId: 'local', relativePath: '行程笔记.md', content: original, signature: 'original', modified: 1 } }, drafts: {}, images: { [JSON.stringify(['local', record.imagePath])]: image }, imageImports: { existing: record } }))
      localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([{ rootId: 'local', relativePath: '行程笔记.md' }]))
    }
    const decode = window.createImageBitmap.bind(window)
    window.createImageBitmap = async (...args) => { if (window.__holdDecode) { window.__holdDecode = false; await new Promise(resolve => { window.__releaseDecode = resolve }) }; return decode(...args) }
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function(k) { if (k === stateKey && window.__failRead) { window.__failRead = false; throw new Error('测试：读取图片记录失败') }; return get.call(this, k) }
  }, { stateKey, key, original, image: { dataUrl: 'data:image/png;base64,' + png.toString('base64'), width: 320, height: 200, bytes: png.length } })
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.continue-card').tap(); await button('编辑').tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(candidate)
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).press('Control+End')
  const before = await data(), editor = await page.locator('.cm-content').elementHandle()
  await button('图片与附件').tap(); await page.getByLabel('图片说明', { exact: true }).fill('路线示意'); await shot('compose')
  if (baseline) {
    await button('预览图片').tap(); await page.locator('.image-import-preview img').waitFor(); await shot('inline-preview')
    await back(); report.previewBackClosesTask = await page.getByRole('dialog').count() === 0
    await button('图片与附件').tap(); report.previewBackLosesDescription = await page.getByLabel('图片说明', { exact: true }).inputValue() !== '路线示意'
    await page.getByLabel('选择要导入的图片文件').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: png })
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('草稿已保护', { exact: true }).waitFor()
    report.selectionImmediatelyChangesDraft = (await data()).drafts[key].content !== before.drafts[key].content
    assert.equal((await data()).documents[key].content, original)
  } else {
    await button(/^笔记中的图片/).tap(); await page.locator('[data-image-reference]').first().waitFor(); await shot('references')
    await page.locator('[data-image-reference]').filter({ hasText: '车票' }).first().tap(); await shot('replace')
    await button('从导入记录选择').tap(); await page.locator('[data-image-id="existing"]').waitFor(); await shot('history')
    await page.locator('[data-image-id="existing"]').tap(); await page.locator('.image-import-preview img').waitFor(); await back()
    assert.equal(await page.locator('[data-image-id="existing"]').evaluate(el => el === document.activeElement), true)
    await back(); await back(); await back()
    assert.equal(await page.getByLabel('图片说明', { exact: true }).inputValue(), '路线示意')
    assert.equal(await button(/^笔记中的图片/).evaluate(el => el === document.activeElement), true)
    assert.deepEqual(draft(await data()), draft(before))
    report.checks.push('Reference → replacement → history → detail Back restores each actual parent, trigger and description without changing the draft')
    await page.evaluate(() => { window.__holdDecode = true }); await pick(); await page.waitForFunction(() => !!window.__releaseDecode)
    await back(); await back(); assert.equal(await page.getByRole('dialog', { name: '图片与附件', exact: true }).count(), 1)
    await page.evaluate(() => window.__releaseDecode()); await page.locator('.image-import-preview img').waitFor(); await button('插入光标处').waitFor(); await shot('detail')
    const chosen = await data(), id = Object.keys(chosen.imageImports).find(id => id !== 'existing')
    assert.deepEqual(draft(chosen), draft(before)); assert.deepEqual(chosen.documents, before.documents)
    assert.equal(Object.keys(chosen.imageImports).length, 2)
    assert.equal(chosen.images[JSON.stringify(['local', chosen.imageImports[id].imagePath])].dataUrl, 'data:image/png;base64,' + png.toString('base64'))
    assert.deepEqual(chosen.images[JSON.stringify(['local','attachments/existing.png'])], before.images[JSON.stringify(['local','attachments/existing.png'])])
    report.geometry = await page.locator('.bottom-sheet').evaluate(sheet => {
      const box = selector => { const node = sheet.querySelector(selector), r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
      return { header: box('.sheet-heading'), photo: box('.image-import-preview'), file: box('.image-import-preview + .image-task-file'), footer: box('.image-task-footer'), action: box('.image-task-footer button:last-child'), bodyPadding: getComputedStyle(sheet.querySelector('.image-task-body')).padding }
    })
    report.checks.push('Selecting an image creates a retained image copy and review step, but does not insert; busy decoding consumes repeated Back')
    await button('图片与附件说明').tap(); await page.getByRole('dialog', { name: '图片与附件说明' }).waitFor(); await back()
    assert.equal(await button('图片与附件说明').evaluate(el => el === document.activeElement), true)
    await back(); assert.equal(await page.getByLabel('图片说明', { exact: true }).inputValue(), '路线示意')
    assert.equal(await button('选择图片').evaluate(el => el === document.activeElement), true)
    await button('导入记录').tap(); await page.locator(`[data-image-id="${id}"]`).tap()
    await button('插入光标处').tap(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('草稿已保护', { exact: true }).waitFor()
    const inserted = await data(); assert.equal(inserted.documents[key].content, original)
    assert.equal(Object.keys(inserted.imageImports).length, 2); assert.equal(await editor.evaluate(node => node.isConnected), true)
    assert.ok(inserted.drafts[key].content.includes('![路线示意](<attachments/'))
    await button('撤销').tap(); await page.getByText('草稿已保护', { exact: true }).waitFor()
    assert.equal((await data()).drafts[key].content, before.drafts[key].content)
    report.checks.push('Help and cancel retain the selected image record; later confirmation inserts once into the original editor, and Undo restores the prior draft without deleting assets')
    await button('图片与附件').tap(); await page.getByLabel('图片说明', { exact: true }).fill('取消后仍保留')
    const cancelBefore = await data(), picker = page.waitForEvent('filechooser'); await button('选择图片').tap(); await (await picker).setFiles([])
    await page.getByRole('status').getByText('已取消选择，正文未改动。', { exact: true }).waitFor()
    assert.equal(await button('选择图片').evaluate(el => el === document.activeElement), true)
    assert.equal(await page.getByLabel('图片说明', { exact: true }).inputValue(), '取消后仍保留')
    assert.deepEqual((await data()).imageImports, cancelBefore.imageImports); assert.deepEqual(draft(await data()), draft(cancelBefore))
    report.checks.push('Cancelling the browser chooser creates no record, leaves source/draft/description intact and restores the choose trigger')
    await page.evaluate(stateKey => {
      const state = JSON.parse(localStorage.getItem(stateKey)), source = state.imageImports.existing
      for (let n = 0; n < 20; n++) { const id = 'list-' + n; state.imageImports[id] = { ...source, id, name: `历史-${n}.png`, created: 100 + n } }
      localStorage.setItem(stateKey, JSON.stringify(state))
    }, stateKey)
    await button('导入记录').tap(); await page.locator('[data-image-id="list-0"]').waitFor()
    const rowsBefore = await page.locator('[data-image-id]').count()
    await page.evaluate(() => { window.__failRead = true }); await button('刷新图片记录').tap(); await page.locator('.image-attachments [role=alert]').waitFor()
    assert.equal(await page.locator('[data-image-id]').count(), rowsBefore)
    const last = page.locator('[data-image-id="existing"]'); await last.scrollIntoViewIfNeeded()
    const listTop = await page.locator('.image-task-body').evaluate(el => el.scrollTop); assert.ok(listTop > 500)
    await page.evaluate(() => { window.__failRead = true }); await last.tap()
    await button('重新读取图片').waitFor(); assert.equal(await button('插入光标处').isVisible(), false)
    await button('重新读取图片').tap(); await page.locator('.image-import-preview img').waitFor()
    assert.equal(await button('插入光标处').isEnabled(), true)
    await back(); assert.equal(await last.evaluate(el => el === document.activeElement), true)
    assert.equal(await page.locator('.image-task-body').evaluate(el => el.scrollTop), listTop)
    await page.locator('.image-attachments [role=alert]').waitFor()
    report.checks.push('Failed history refresh retains its usable rows and local error; detail failure blocks insertion, rechecking recovers, and Back restores nonzero list scroll and row focus')
    await last.tap(); const imageBefore = await data()
    await page.evaluate(stateKey => { const state = JSON.parse(localStorage.getItem(stateKey)); delete state.images[JSON.stringify(['local','attachments/existing.png'])]; localStorage.setItem(stateKey, JSON.stringify(state)) }, stateKey)
    await button('插入光标处').tap(); await page.locator('.image-attachments [role=alert]').waitFor()
    assert.equal(await button('插入光标处').isVisible(), false); assert.deepEqual(draft(await data()), draft(imageBefore))
    await page.evaluate(({ stateKey, images }) => { const state = JSON.parse(localStorage.getItem(stateKey)); state.images = images; localStorage.setItem(stateKey, JSON.stringify(state)) }, { stateKey, images: imageBefore.images })
    await button('重新读取图片').tap(); await page.locator('.image-import-preview img').waitFor()
    report.checks.push('Confirmation revalidates a previously previewed file: an asset lost before insertion cannot modify the draft, and explicit rechecking can recover it')
    const changeBefore = await data()
    await page.evaluate(({ stateKey, dataUrl, bytes }) => { const state = JSON.parse(localStorage.getItem(stateKey)); state.images[JSON.stringify(['local','attachments/existing.png'])] = { dataUrl, bytes, width: 320, height: 200 }; localStorage.setItem(stateKey, JSON.stringify(state)) }, { stateKey, dataUrl: 'data:image/jpeg;base64,' + changedImage.toString('base64'), bytes: changedImage.length })
    await button('插入光标处').tap(); await page.waitForTimeout(100)
    assert.equal(await page.getByRole('dialog', { name: '核对图片', exact: true }).count(), 1, 'A changed image must stay in review instead of being silently inserted')
    await page.locator('.image-attachments [role=alert]').getByText(/图片内容已变化/).waitFor()
    assert.deepEqual(draft(await data()), draft(changeBefore))
    await shot('changed-image-requires-review')
    await scan('changed-image-review')
    await page.evaluate(({ stateKey, images }) => { const state = JSON.parse(localStorage.getItem(stateKey)); state.images = images; localStorage.setItem(stateKey, JSON.stringify(state)) }, { stateKey, images: changeBefore.images })
    await back(); await last.tap(); await page.locator('.image-import-preview img').waitFor()
    report.checks.push('If image bytes change after preview, confirmation shows the current picture and requires a new explicit review; the draft remains unchanged')
    await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; document.querySelector('.mobile-app').classList.add('theme-dark') })
    await scan('detail-dark-200'); await shot('detail-dark-200')
    const photo = await page.locator('.image-import-preview img').boundingBox(); assert.ok(photo && photo.x >= 0 && photo.x + photo.width <= 320)
    await back(); await scan('history-dark-200'); await back(); await scan('compose-dark-200')
    await button(/^笔记中的图片/).tap(); await scan('references-dark-200')
    await page.locator('[data-image-reference]').filter({ hasText: '车票' }).first().tap(); await scan('replace-dark-200')
    await page.setViewportSize({ width: 320, height: 400 }); await button('从导入记录选择').tap(); await last.scrollIntoViewIfNeeded(); await last.tap()
    await button('替换这一处图片').scrollIntoViewIfNeeded(); await scan('detail-short-dark-200'); await shot('detail-short-200')
    await back(); await back()
    assert.equal(await button('从导入记录选择').evaluate(el => el === document.activeElement), true)
    report.checks.push('All five image steps fit 320px at 200% in dark mode; short viewports keep decisions reachable and Back restores the replacement parent')
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.querySelector('.mobile-app').classList.remove('theme-dark') })
    await button('从导入记录选择').tap(); await page.locator(`[data-image-id="${id}"]`).tap(); await button('替换这一处图片').tap()
    await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('草稿已保护', { exact: true }).waitFor()
    const replaced = await data(); assert.ok(replaced.drafts[key].content.includes('![车票](<attachments/'))
    assert.ok(replaced.drafts[key].content.includes('![车票副本](missing.png)'))
    assert.ok(replaced.drafts[key].content.includes('![路线图](attachments/existing.png)'))
    assert.equal(replaced.documents[key].content, original)
    report.checks.push('Replacing a chosen missing reference preserves its label, a sibling with the same old URL, all other source text and the saved original')
    await button('图片与附件').tap(); await page.evaluate(stateKey => { const state = JSON.parse(localStorage.getItem(stateKey)); state.imageFaults = { local: 'unconfirmed' }; localStorage.setItem(stateKey, JSON.stringify(state)) }, stateKey)
    const retryBefore = await data(); await pick(); await page.getByText('导入未确认，正文未改动', { exact: true }).waitFor()
    await button('重试导入').tap(); await page.locator('.image-attachments [role=alert]').waitFor()
    assert.deepEqual(draft(await data()), draft(retryBefore)); assert.equal(await page.locator('.image-import-preview img').count(), 1)
    await page.evaluate(stateKey => { const state = JSON.parse(localStorage.getItem(stateKey)); delete state.imageFaults.local; localStorage.setItem(stateKey, JSON.stringify(state)) }, stateKey)
    await button('重试导入').tap(); await button('插入光标处').waitFor()
    assert.deepEqual(draft(await data()), draft(retryBefore))
    assert.ok(Object.values((await data()).imageImports).some(record => record.previousPaths?.length === 2 && record.status === 'ready'))
    await shot('retry-ready-not-inserted'); await back(); await back()
    report.checks.push('Unconfirmed import and failed retry retain a previewable recovery copy; successful retry preserves previous paths and still waits for explicit insertion')
    const selectBefore = await data()
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).focus(); await page.keyboard.press('Control+a')
    await button('图片与附件').tap(); await button('导入记录').tap(); await page.locator('[data-image-id="existing"]').tap()
    await button('替换选中文字').waitFor(); assert.deepEqual(draft(await data()), draft(selectBefore))
    await button('替换选中文字').tap(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('草稿已保护', { exact: true }).waitFor()
    assert.match((await data()).drafts[key].content, /^!\[existing\]\(<attachments\/existing.png>\)/)
    await button('撤销').tap(); await page.getByText('草稿已保护', { exact: true }).waitFor()
    assert.equal((await data()).drafts[key].content, selectBefore.drafts[key].content)
    report.checks.push('Selected text is preserved throughout review; only the explicitly named replacement action changes it, and one Undo restores the entire prior draft')
    await button('返回资料库').tap(); await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '图片导入记录')
    await page.locator('[data-image-id="existing"]').scrollIntoViewIfNeeded(); await page.locator('[data-image-id="existing"]').tap()
    await page.getByRole('heading', { name: '图片详情', exact: true }).waitFor()
    assert.match(await page.locator('.image-import-preview + .image-task-file').innerText(), /手机资料库 · 行程笔记.md/)
    assert.equal(await button('插入光标处').count(), 0)
    await back(); await back(); assert.equal(await button('图片导入记录').evaluate(el => el === document.activeElement), true)
    assert.equal((await data()).documents[key].content, original)
    report.checks.push('Settings history reviews images without an insertion destination, then returns to its Settings trigger; the saved source remains byte-identical')
  }
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
