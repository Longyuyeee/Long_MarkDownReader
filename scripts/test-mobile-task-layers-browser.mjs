import { readTextImportPreview, dismissTextImportTask } from './mobile-text-import-navigation.mjs'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = process.env.LONGEDIT_TASK_LAYERS_OUTPUT || `docs/evidence/mobile-0.1.0/task-layers-browser-${Date.now()}`
await mkdir(output, { recursive: true })
await writeFile(path.join(output, '.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'mobile-task-layers', baseline, nativeAndroidTest: false, checks: [], errors: [] }
const stateKey = 'longedit-mobile-preview-v1'
let page
const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), stateKey)
const back = () => page.evaluate(() => window.__longeditMobileBack())
const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
const button = name => page.getByRole('button', { name, exact: true })
const waitIdle = () => page.waitForFunction(() => !document.querySelector('[aria-label="关闭面板"]')?.disabled && !document.querySelector('.file-import-panel [role=status]')?.textContent?.includes('正在'))
const close = async () => { if (await page.locator('.file-import-panel').isVisible()) await dismissTextImportTask(page); else await button('关闭面板').tap() }
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const violations = await page.evaluate(async () => (await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id }) => id))
  assert.deepEqual(violations, [], name)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name)
  ;(report.accessibility ||= []).push({ name, violations })
}
async function openImport() {
  await page.getByRole('button', { name: '添加资料', exact: true }).tap()
  await page.getByRole('button', { name: '导入文本文件', exact: true }).tap()
  await page.getByRole('dialog', { name: '文件导入', exact: true }).waitFor()
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(key => {
    if (window !== window.top || localStorage.getItem(key)) return
    const id = JSON.stringify(['local', '原笔记.md'])
    localStorage.setItem(key, JSON.stringify({ version: 1, libraries: [{ id: 'outside', name: '外部资料库', available: true, writable: true, external: true }], documents: { [id]: { rootId: 'local', relativePath: '原笔记.md', content: '原文件\r\n', signature: 'original', modified: 1 } }, drafts: { [id]: { rootId: 'local', relativePath: '原笔记.md', content: '未保存的草稿😀\r\n', expectedSignature: 'original', revision: 4, updated: 1 } } }))
  }, stateKey)
  page = await context.newPage()
  page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  const original = await data()
  await openImport()
  const source = '# 行程核对\r\n杭州 → 苏州😀\r\n保留这份输入\r\n'
  await page.getByLabel('选择导入文件', { exact: true }).setInputFiles({ name: '行程.md', mimeType: 'text/plain', buffer: Buffer.from(source) })
  await page.getByRole('button', { name: '存入手机资料库并打开', exact: true }).waitFor()
  await waitIdle()
  const record = Object.values((await data()).fileImports)[0]
  await page.getByRole('button', { name: '移除记录', exact: true }).tap()
  await shot('text-remove-confirm')
  if (!baseline) report.confirmationGeometry = await page.getByRole('alertdialog').evaluate(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element)
    return { x: box.x, y: box.y, width: box.width, height: box.height, padding: style.padding, radius: style.borderRadius, titleSize: getComputedStyle(element.querySelector('h3')).fontSize, actionHeights: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length && !button.closest('[inert]')).map(button => button.getBoundingClientRect().height) }
  })
  await back()
  if (baseline) {
    report.confirmBackClosesTask = await page.getByRole('dialog').count() === 0
    await openImport()
    await page.locator(`[data-file-import-id="${record.id}"]`).tap()
  } else {
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor()
    assert.equal(await page.getByRole('group', { name: '确认移除导入记录', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '移除记录', exact: true }).evaluate(el => el === document.activeElement), true)
    report.checks.push('Back cancels only the text removal confirmation and restores its trigger; the pending record remains unchanged')
  }
  await page.getByRole('button', { name: '连接原文件夹', exact: true }).tap()
  await page.getByRole('dialog', { name: '选择资料库', exact: true }).waitFor()
  await shot('folder-choice')
  await back()
  if (baseline) {
    report.folderBackLosesDetail = await page.getByRole('heading', { name: '行程.md', exact: true }).count() === 0
    await shot('folder-return')
  } else {
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '连接原文件夹', exact: true }).evaluate(el => el === document.activeElement), true)
    assert.equal(await readTextImportPreview(page), source.replace(/\r\n/g, '\n'))
    await shot('folder-return')
    await button('连接原文件夹').tap()
    await page.locator('.root-option').filter({ hasText: '外部资料库' }).tap()
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor(); await waitIdle()
    assert.equal(await button('连接原文件夹').evaluate(el => el === document.activeElement), true)
    assert.equal(await readTextImportPreview(page), source.replace(/\r\n/g, '\n'))
    report.checks.push('Folder chooser Back and successful library selection both return to the mounted import detail with its retained text and trigger focus')
    // Nested confirmation returns to the chooser first, then to the original detail.
    await button('连接原文件夹').tap()
    await button('停止访问 外部资料库').tap()
    await page.getByRole('alertdialog', { name: '停止访问文件夹？', exact: true }).waitFor()
    await back()
    await page.getByRole('dialog', { name: '选择资料库', exact: true }).waitFor()
    assert.equal(await button('停止访问 外部资料库').evaluate(el => el === document.activeElement), true)
    assert.deepEqual((await data()).libraries, original.libraries)
    // X also dismisses just the chooser when a parent task exists.
    await close()
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor()
    report.checks.push('Disconnect confirmation Back restores the chooser and trigger; dismissing the chooser returns to its actual import parent without revoking access')

    await page.locator('.sheet-heading .mobile-help-trigger').tap()
    await back()
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor()
    await button('移除记录').tap()
    await page.getByRole('alertdialog', { name: '移除这条导入记录？', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('group', { name: '确认移除导入记录', exact: true }).count(), 0)
    await button('移除记录').tap()
    await page.locator('.sheet-backdrop').tap({ position: { x: 4, y: 4 } })
    await button('移除记录').waitFor()
    report.checks.push('Help Back restores the detail; Escape and backdrop dismiss one confirmation without losing its detail')

    // A history below the first viewport must return to the exact selected record.
    await page.evaluate(({ key, created }) => {
      const d = JSON.parse(localStorage.getItem(key))
      for (let i = 0; i < 23; i++) d.fileImports[`history-${i}`] = { id: `history-${i}`, name: `旧记录 ${i}.md`, created: created + i + 1, bytes: 0, status: 'failed', readable: false, content: null, digest: null, localPath: null, error: '接收未完成' }
      localStorage.setItem(key, JSON.stringify(d))
    }, { key: stateKey, created: record.created })
    await back(); await waitIdle()
    const row = page.locator(`[data-file-import-id="${record.id}"]`)
    await row.scrollIntoViewIfNeeded(); await row.focus()
    const historyTop = await page.locator('.file-import-body').evaluate(el => el.scrollTop)
    await row.tap(); await waitIdle(); await back(); await waitIdle()
    assert.equal(await row.evaluate(el => el === document.activeElement), true)
    assert.ok(Math.abs(await page.locator('.file-import-body').evaluate(el => el.scrollTop) - historyTop) <= 2)
    await shot('text-history-return')
    report.checks.push('Detail Back returns to the same record and scroll position in a long history, without reordering or discarding it')

    await close(); await button('切换深色').tap(); await openImport(); await row.tap(); await waitIdle()
    await page.setViewportSize({ width: 320, height: 640 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
    await button('移除记录').tap()
    await scan('320px / 200% text / confirmation')
    const bounds = await page.getByRole('alertdialog').boundingBox()
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 320 && bounds.y + bounds.height <= 640)
    for (const name of ['保留记录', '确认移除记录']) { const action = await button(name).boundingBox(); assert.ok(action.height >= 48 && action.y >= 0 && action.y + action.height <= 640) }
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog],[role=alertdialog]') && !document.activeElement?.closest('[inert]')), true) }
    await shot('320-confirmation-200')
    await back(); await scan('320px / 200% text / detail')
    await button('连接原文件夹').tap(); await scan('320px / 200% text / folder choice')
    await back(); await close()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '16px' })
    report.checks.push('Confirmation, detail and chooser fit 320px and 200% text; visible modal controls retain focus and pass selected WCAG A/AA checks')

    // Own PDF bytes; only the browser receiver contract is synthesized.
    const pdf = await readFile('scripts/fixtures/mobile-pdf-navigation-design.pdf')
    const pdfId = await page.evaluate(({ key, base64, digest, bytes }) => {
      const d = JSON.parse(localStorage.getItem(key)), id = crypto.randomUUID()
      d.pdfImports = { [id]: { id, name: '分层阅读.pdf', created: Date.now(), bytes, status: 'ready', incoming: false, source: 'share-file', readable: true, error: '', localPath: null, base64, digest } }
      localStorage.setItem(key, JSON.stringify(d)); return id
    }, { key: stateKey, base64: pdf.toString('base64'), digest: createHash('sha256').update(pdf).digest('hex'), bytes: pdf.length })
    await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, 'PDF 接收记录')
    await page.locator(`[data-pdf-import-id="${pdfId}"]`).tap(); await waitIdle()
    await page.locator('.pdf-intake-preview canvas').waitFor()
    await button('移除这条接收记录').tap(); await shot('pdf-remove-confirm')
    await scan('390px / dark PDF removal confirmation')
    await back(); await page.locator('.pdf-intake-preview canvas').waitFor()
    await button('返回上一层').tap()
    await page.locator(`[data-pdf-import-id="${pdfId}"]`).waitFor()
    assert.equal(await page.locator(`[data-pdf-import-id="${pdfId}"]`).evaluate(el => el === document.activeElement), true)
    assert.equal((await data()).pdfImports[pdfId].base64, pdf.toString('base64'))
    await back()
    report.checks.push('PDF confirmation, detail, history and Settings consume separate Back steps while retaining the exact staged PDF bytes')

    const packed = spawnSync('python', ['-c', 'import sys,zipfile,io,base64; o=io.BytesIO(); z=zipfile.ZipFile(o,"w",zipfile.ZIP_DEFLATED); z.writestr("info.json",\'{"version":2,"type":"net.daringfireball.markdown"}\'); z.writestr("text.md",b"# Review\\n\\n![image](assets/photo.png)"); z.writestr("assets/photo.png",base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwSV3/HwAEYQJIOvJo2gAAAABJRU5ErkJggg==")); z.close(); sys.stdout.buffer.write(o.getvalue())'])
    assert.equal(packed.status, 0, packed.stderr.toString())
    const archive = packed.stdout
    await openMobileSettingsTransfer(page, '附件包导入记录')
    await page.getByLabel('选择附件包文件', { exact: true }).setInputFiles({ name: '核对.textpack', mimeType: 'application/octet-stream', buffer: Buffer.from(archive) })
    await page.getByRole('heading', { name: '核对.textpack', exact: true }).waitFor(); await waitIdle()
    await page.getByRole('button', { name: /^附件清单/ }).tap(); await button('查看包内图片：assets/photo.png').tap(); await waitIdle()
    await page.getByAltText('包内图片：assets/photo.png', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.pack-import-panel figure img')?.naturalWidth > 0)
    await back()
    assert.equal(await page.getByAltText('包内图片：assets/photo.png', { exact: true }).count(), 0)
    await back(); await button('移除记录').tap(); await scan('390px / dark TextPack removal confirmation'); await back()
    await button('将笔记和附件存入手机资料库').waitFor()
    await back(); await page.getByRole('dialog', { name: '导入记录', exact: true }).waitFor()
    await back()
    report.checks.push('TextPack image preview, removal confirmation, detail and history each return to their own parent without committing or deleting anything')

    // Block a digest to exercise repeated Back during an in-flight commit, then
    // fail document admission after the receipt was safely committed.
    await activateMobileRoot(page, '资料'); await openImport(); await row.tap(); await waitIdle()
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle)
      crypto.subtle.digest = async (...args) => { if (window.__holdDigest) { window.__holdDigest = false; await new Promise(resolve => { window.__releaseDigest = resolve }) }; return digest(...args) }
      window.__holdDigest = true
      const parse = JSON.parse
      JSON.parse = function (...args) {
        const value = parse(...args)
        if (window.__failAdmission && value?.version === 1 && Object.values(value.fileImports || {}).some(r => r.status === 'imported')) value.documents = new Proxy(value.documents, { get(target, key) { if (typeof key === 'string' && key.includes('-导入-')) throw new Error('模拟导入副本打开失败'); return Reflect.get(target, key) } })
        return value
      }
      window.__failAdmission = true
    })
    await button('存入手机资料库并打开').tap()
    await page.waitForFunction(() => !!window.__releaseDigest)
    await back(); await back()
    await page.getByRole('heading', { name: '行程.md', exact: true }).waitFor()
    assert.equal(await button('返回导入记录').isDisabled(), true)
    await page.evaluate(() => window.__releaseDigest())
    await page.getByRole('alert').filter({ hasText: '模拟导入副本打开失败' }).waitFor()
    await button('打开已导入笔记').waitFor(); await shot('open-failed-keeps-detail')
    await page.evaluate(() => { window.__failAdmission = false })
    const committed = await data(), target = committed.fileImports[record.id].localPath
    assert.equal(committed.documents[JSON.stringify(['local', target])].content, source)
    await button('打开已导入笔记').tap(); await page.locator('.reader-header h1').waitFor()
    assert.equal(Object.keys((await data()).documents).length, Object.keys(committed.documents).length)
    await back()
    report.checks.push('Repeated Back cannot abandon an in-flight commit; an admission failure retains the imported receipt and original note, and retry opens the single committed copy')
  }
  const current = await data()
  for (const [key, document] of Object.entries(original.documents)) assert.deepEqual(current.documents[key], document)
  assert.deepEqual(current.drafts, original.drafts)
  if (baseline) assert.equal(current.fileImports[record.id].content, source)
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = String(error.stack || error)
  process.exitCode = 1
  if (page) await shot('failure').catch(() => {})
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  console.log(JSON.stringify({ output, ...report }, null, 2))
}
