import { leavePackResult, reopenPackResult } from './mobile-pack-navigation.mjs'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = process.env.LONGEDIT_EXPORT_LAYERS_OUTPUT || `docs/evidence/mobile-0.1.0/export-layers-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(path.join(output, '.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'mobile-export-layers', baseline, nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
const key = JSON.stringify(['local', '行程笔记.md']), source = '# 行程笔记\r\n\r\n![路线](files/route.png)\r\n[记录](files/trip.bin)\r\n'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwSV3/HwAEYQJIOvJo2gAAAABJRU5ErkJggg=='
let page
const button = name => page.getByRole('button', { name, exact: true })
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
const back = () => page.evaluate(() => window.__longeditMobileBack())
const stableDrafts = drafts => Object.fromEntries(Object.entries(drafts).map(([key, { updated, ...draft }]) => [key, draft]))
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
const idle = () => page.waitForFunction(() => !document.querySelector('.export-task-sheet .sheet-heading button')?.disabled)
const row = id => page.locator(`[data-pack-id="${id}"]`)
async function inspect(id) { await row(id).tap(); await page.getByRole('heading', { name: '附件包详情', exact: true }).waitFor(); await idle() }
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const violations = await page.evaluate(async () => (await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id }) => id))
  assert.deepEqual(violations, [], name)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name)
  ;(report.accessibility ||= []).push({ name, violations })
}
function unzip(bytes) {
  const result = spawnSync('python', ['-c', 'import sys,zipfile,io,json,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist() if not n.endswith("/")}))'], { input: bytes, maxBuffer: 20 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr.toString())
  return Object.fromEntries(Object.entries(JSON.parse(result.stdout)).map(([name, value]) => [name, Buffer.from(value, 'base64')]))
}
async function openPack() {
  await button('文档操作').tap(); await button('导出笔记与附件').tap()
  await button('下载笔记与附件').waitFor(); await page.waitForFunction(() => !document.querySelector('.portable-export .primary-button')?.disabled)
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ key, source, png }) => {
    if (window !== window.top) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents: { [key]: { rootId: 'local', relativePath: '行程笔记.md', content: source, signature: 'original', modified: 1 } }, drafts: {}, images: { [JSON.stringify(['local', 'files/route.png'])]: { dataUrl: `data:image/png;base64,${png}`, width: 1, height: 1, bytes: atob(png).length } }, attachments: { [JSON.stringify(['local', 'files/trip.bin'])]: { base64: 'AAH/AA==' } } }))
    const click = HTMLAnchorElement.prototype.click
    window.__blockExportDownload = true
    HTMLAnchorElement.prototype.click = function () { if (this.download && window.__blockExportDownload) throw new Error('模拟保存未完成'); return click.call(this) }
  }, { key, source, png })
  page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  const original = await data()
  await page.locator('.file-row').filter({ hasText: '行程笔记.md' }).tap(); await button('编辑').tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill('未保存的想法😀\n' + source)
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await openPack(); await shot('preview'); await button('下载笔记与附件').tap()
  await page.getByRole('alert').filter({ hasText: '模拟保存未完成' }).waitFor()
  const protectedState = await data(), record = Object.values(protectedState.packExports)[0]
  let expectedDrafts = stableDrafts(protectedState.drafts)
  await shot('preview-failed')
  await button('查看附件包导出记录').tap(); await shot('history')
  await back()
  if (baseline) {
    report.historyBackLosesPreview = await button('下载笔记与附件').count() === 0
    await openPack(); await button('查看附件包导出记录').tap()
    await button('核对清单').tap(); await button('移除记录').tap(); await shot('remove-confirm')
    await back()
    report.confirmBackClosesTask = await page.getByRole('dialog').count() === 0
    await shot('confirm-return')
  } else {
    await button('重试下载').waitFor()
    await page.getByRole('alert').filter({ hasText: '模拟保存未完成' }).waitFor()
    assert.equal(await button('查看附件包导出记录').evaluate(el => el === document.activeElement), true)
    assert.deepEqual((await data()).packExports, protectedState.packExports)
    await shot('history-return')
    report.checks.push('History Back restores its own export result, failure message and trigger focus without creating another package')

    await leavePackResult(page, back)
    const geometry = await page.locator('.export-task-sheet').evaluate(element => {
      const b = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
      return { sheet: b(element), header: b(element.querySelector('.sheet-heading')), file: b(element.querySelector('.pack-review-file')), footer: b(element.querySelector('.pack-export-footer')), primary: b(element.querySelector('.primary-button')) }
    })
    assert.equal(geometry.header.height, 64); assert.equal(geometry.file.x, 16); assert.equal(geometry.file.width, 358); assert.ok(geometry.primary.height >= 48)
    report.geometry = geometry
    await page.getByRole('button', { name: /^附件清单/ }).tap()
    await page.getByRole('heading', { name: '附件清单', exact: true }).waitFor()
    assert.equal(await page.getByLabel('将携带的附件', { exact: true }).locator('li').count(), 2)
    await shot('manifest'); await back(); await button('下载笔记与附件').waitFor()
    assert.equal(await page.getByRole('button', { name: /^附件清单/ }).evaluate(el => el === document.activeElement), true)
    report.checks.push('The attachment manifest is a separate page; Back restores the preview and manifest trigger while preserving the captured draft')

    await page.evaluate(() => {
      const parse = JSON.parse
      JSON.parse = function (...args) {
        const value = parse(...args)
        if (window.__failPackHistory && value?.version === 1) value.packExports = new Proxy(value.packExports || {}, { ownKeys() { throw new Error('模拟读取导出记录失败') } })
        return value
      }
      window.__failPackHistory = true
    })
    await button('查看附件包导出记录').tap()
    await page.getByRole('alert').filter({ hasText: '模拟读取导出记录失败' }).waitFor()
    await row(record.id).waitFor()
    assert.equal(await page.getByText('还没有保留的附件包。', { exact: true }).count(), 0)
    await page.evaluate(() => { window.__failPackHistory = false }); await back()
    await reopenPackResult(page)
    await page.getByRole('alert').filter({ hasText: '模拟保存未完成' }).waitFor()
    await leavePackResult(page, back)
    report.checks.push('A failed history read keeps the last usable list and a local retry error; returning restores the independent preview error and captured export')

    // Five additional fixture receipts exercise scrolling and isolated deletion.
    await page.evaluate(({ id }) => {
      const k = 'longedit-mobile-preview-v1', d = JSON.parse(localStorage.getItem(k)), first = d.packExports[id]
      for (let i = 0; i < 5; i++) { const other = crypto.randomUUID(); d.packExports[other] = { ...first, id: other, name: `较早保留的行程资料与阅读安排记录 ${i}.textpack`, created: first.created + i + 1 } }
      localStorage.setItem(k, JSON.stringify(d))
    }, { id: record.id })
    await page.setViewportSize({ width: 390, height: 600 })
    await button('查看附件包导出记录').tap(); await idle()
    assert.equal(await button('再次下载').count(), 0, 'History exposes one entry per record, not all record actions')
    await row(record.id).scrollIntoViewIfNeeded(); await row(record.id).focus()
    const historyScroll = await page.locator('.pack-export-body').evaluate(el => el.scrollTop)
    assert.ok(historyScroll > 0, 'The selected receipt is below the first viewport')
    await inspect(record.id)
    assert.equal(await page.getByLabel('包内附件', { exact: true }).locator('li').count(), 2)
    await page.locator('.sheet-heading .mobile-help-trigger').tap(); await back()
    await page.getByRole('heading', { name: '附件包详情', exact: true }).waitFor()
    await back(); await row(record.id).waitFor()
    assert.equal(await row(record.id).evaluate(el => el === document.activeElement), true)
    assert.ok(Math.abs(await page.locator('.pack-export-body').evaluate(el => el.scrollTop) - historyScroll) <= 2)
    report.checks.push('History presents compact rows; details and help return to their own parent, restoring the selected row and list scroll')

    await page.setViewportSize({ width: 390, height: 844 }); await inspect(record.id); await shot('detail')
    const beforeCancel = (await data()).packExports
    await button('移除记录').tap(); await page.getByRole('alertdialog', { name: '移除这份导出记录？', exact: true }).waitFor()
    await shot('remove-confirm')
    assert.equal(await page.locator('.sheet-backdrop').evaluate(el => el.inert), true)
    assert.equal(await button('继续保留').evaluate(el => el === document.activeElement), true)
    await back(); await button('移除记录').waitFor()
    assert.equal(await button('移除记录').evaluate(el => el === document.activeElement), true)
    await button('移除记录').tap(); await page.keyboard.press('Escape')
    await button('移除记录').tap(); await page.locator('.mobile-confirmation-backdrop').tap({ position: { x: 4, y: 4 } })
    assert.deepEqual((await data()).packExports, beforeCancel)
    report.checks.push('Back, Escape and backdrop cancel only removal; the real detail remains behind the dialog and returns with its trigger focus')

    // Storage refusal must leave the confirmation usable and all receipts intact.
    await page.evaluate(() => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'longedit-mobile-preview-v1' && window.__failRemove) {
          const before = JSON.parse(localStorage.getItem(key)), after = JSON.parse(value)
          if (Object.keys(after.packExports || {}).length < Object.keys(before.packExports || {}).length) throw new DOMException('模拟移除空间不足', 'QuotaExceededError')
        }
        const result = set.call(this, key, value)
        if (key === 'longedit-mobile-preview-v1' && window.__failAfterDelete) { window.__failAfterDelete = false; window.__failPackHistory = true }
        return result
      }
      window.__failRemove = true
    })
    await button('移除记录').tap(); await button('确认移除记录').tap()
    await page.getByRole('alertdialog').getByRole('alert').waitFor()
    assert.deepEqual((await data()).packExports, beforeCancel)
    await button('继续保留').tap(); await button('移除记录').waitFor()
    await page.evaluate(() => { window.__failRemove = false })
    report.checks.push('A failed removal retains every protected package and stays inside the confirmation; Keep safely returns to the same detail')

    // Hold actual byte verification while issuing repeated Back calls.
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle)
      crypto.subtle.digest = async (...args) => { if (window.__holdDigest) { window.__holdDigest = false; await new Promise(resolve => { window.__releaseDigest = resolve }) }; return digest(...args) }
      window.__holdDigest = true
    })
    await button('再次下载').tap(); await page.waitForFunction(() => !!window.__releaseDigest)
    await back(); await back()
    await page.getByRole('heading', { name: '附件包详情', exact: true }).waitFor()
    assert.equal(await button('返回导出记录').isDisabled(), true)
    await page.evaluate(() => window.__releaseDigest())
    await page.getByRole('alert').filter({ hasText: '模拟保存未完成' }).waitFor()
    await idle()
    report.checks.push('Repeated Back cannot abandon an in-flight package verification or pending export; failure keeps the selected record available for retry')

    await page.evaluate(() => { window.__blockExportDownload = false })
    const pending = page.waitForEvent('download'); await button('重试下载').tap()
    const download = await pending, bytes = await readFile(await download.path()), members = unzip(bytes)
    assert.deepEqual(bytes, Buffer.from(record.archive, 'base64'))
    assert.equal(members['note.textbundle/assets/001-route.png'].toString('base64'), png)
    assert.deepEqual([...members['note.textbundle/assets/002-trip.bin']], [0, 1, 255, 0])
    assert.ok(members['note.textbundle/text.markdown'].toString().includes('未保存的想法😀'))
    await writeFile(path.join(output, 'retried.textpack'), bytes)
    assert.equal(Object.keys((await data()).packExports).length, 6)
    report.checks.push('Retry downloads the exact protected archive, independently checks ZIP CRC and binary members, and never duplicates the current receipt')

    await leavePackResult(page, back)
    // Corrupt content is not presented as an empty or successfully checked manifest.
    await page.evaluate(id => { const k = 'longedit-mobile-preview-v1', d = JSON.parse(localStorage.getItem(k)); d.packExports[id].archive = 'AAAA' + d.packExports[id].archive.slice(4); localStorage.setItem(k, JSON.stringify(d)) }, record.id)
    await back(); await inspect(record.id)
    await page.getByRole('alert').filter({ hasText: '核对失败' }).waitFor()
    assert.equal(await button('再次下载').isVisible(), false)
    assert.equal(await button('重新核对清单').isEnabled(), true)
    assert.equal(await page.getByLabel('包内附件', { exact: true }).count(), 0)
    await page.evaluate(({ id, archive }) => { const k = 'longedit-mobile-preview-v1', d = JSON.parse(localStorage.getItem(k)); d.packExports[id].archive = archive; localStorage.setItem(k, JSON.stringify(d)) }, record)
    await button('重新核对清单').tap(); await idle()
    assert.equal(await button('再次下载').isEnabled(), true)
    report.checks.push('Unreadable content preserves the record identity, explains the failure and disables export until explicit rechecking succeeds')

    // Re-enter in dark mode through the actual appearance control.
    await back(); await back(); await back(); await back(); await button('切换深色').tap()
    await page.locator('.file-row').filter({ hasText: '行程笔记.md' }).tap(); await button('继续这份草稿').tap()
    assert.equal((await data()).drafts[key].content, protectedState.drafts[key].content)
    await openPack(); expectedDrafts = stableDrafts((await data()).drafts)
    await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
    await scan('320px / 200% / dark export preview'); await shot('320-preview-200')
    const primary = await button('下载笔记与附件').boundingBox(); assert.ok(primary.y >= 0 && primary.y + primary.height <= 640)
    await button('查看附件包导出记录').tap(); await idle(); await scan('320px / 200% / dark history')
    await inspect(record.id); await scan('320px / 200% / dark detail')
    await button('移除记录').tap(); await scan('320px / 200% / dark confirmation'); await shot('320-confirmation-200')
    const confirmation = await page.getByRole('alertdialog').boundingBox()
    assert.ok(confirmation.y >= 0 && confirmation.y + confirmation.height <= 640)
    for (const name of ['继续保留', '确认移除记录']) { const action = await button(name).boundingBox(); assert.ok(action.height >= 48 && action.y >= 0 && action.y + action.height <= 640) }
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]')), true) }
    await button('继续保留').tap()
    await page.setViewportSize({ width: 320, height: 400 }); await button('再次下载').scrollIntoViewIfNeeded()
    const shortAction = await button('再次下载').boundingBox(); assert.ok(shortAction.y >= 0 && shortAction.y + shortAction.height <= 400)
    await scan('320x400 / 200% / short detail'); await shot('320-short-detail-200')
    await back(); await row(record.id).waitFor()
    const shortRow = await row(record.id).boundingBox(), shortHeader = await page.locator('.sheet-heading').boundingBox()
    // Large text can make a record taller than the scroll area; its title must return into view.
    assert.ok(shortRow.y >= shortHeader.y + shortHeader.height - 1 && shortRow.y < 400)
    await inspect(record.id)
    const shortHeading = await page.locator('.pack-export-file h3[tabindex]:visible').boundingBox()
    assert.ok(shortHeading.y >= (await page.locator('.sheet-heading').boundingBox()).height)
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
    report.checks.push('All four task steps fit 320px and 200% text in dark mode; the primary action is reachable and confirmation focus stays inside the active dialog')

    const others = Object.fromEntries(Object.entries((await data()).packExports).filter(([id]) => id !== record.id))
    await page.evaluate(() => { window.__failAfterDelete = true })
    await button('移除记录').tap(); await button('确认移除记录').tap()
    await page.getByRole('status').filter({ hasText: '本机记录已移除' }).waitFor()
    await page.getByRole('alert').filter({ hasText: '模拟读取导出记录失败' }).waitFor()
    await page.evaluate(() => { window.__failPackHistory = false })
    assert.deepEqual((await data()).packExports, others)
    await back(); await button('下载笔记与附件').waitFor()
    await back(); await page.getByRole('textbox', { name: '笔记正文', exact: true }).waitFor()
    await back(); await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '附件包导出记录'); await idle()
    await back(); await button('附件包导出记录').waitFor()
    assert.equal(await button('附件包导出记录').evaluate(el => el === document.activeElement), true)
    report.checks.push('Confirmed deletion removes only the selected receipt even if refreshing then fails; Back returns through preview to the original editor, while Settings history returns to its real Settings entry')
  }
  const current = await data()
  assert.deepEqual(current.documents, original.documents)
  assert.deepEqual(stableDrafts(current.drafts), expectedDrafts)
  assert.deepEqual(current.images, original.images)
  assert.deepEqual(current.attachments, original.attachments)
  if (baseline) assert.equal(current.packExports[record.id].archive, record.archive)
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error); process.exitCode = 1
  if (page) await shot('failure').catch(() => {})
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2))
}
