import { readMobileDocument } from './mobile-document-navigation.mjs'
import { activateMobileRoot, openMobileSettingsTransfer } from './mobile-settings-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const fixture = path.resolve('release-artifacts/mobile-attachment-fixture/picker')
const output = `docs/evidence/mobile-0.1.0/attachments-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const png = await readFile(path.join(fixture, 'diagram.png'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'browser-preview-attachment-fixtures', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [] }
let page
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  await context.addInitScript(image => {
    if (window !== window.top || localStorage.getItem('longedit-attachment-fixture-ready')) return
    const documents = {}, add = (rootId, relativePath, content) => { documents[JSON.stringify([rootId, relativePath])] = { rootId, relativePath, content, signature: content, modified: 1 } }
    add('local', 'Attachment.md', '# 附件验收\r\n\r\n保留的原文。\r\n\r\n![丢失图片](missing.png)\r\n')
    add('external', 'Retry.md', '# 失败与恢复\n\n外部原文。\n')
    add('external', 'Missing.md', '# 无法搬迁\n\n![尚缺的图](missing.png)\n')
    add('readonly', 'Readonly.md', '# 只读也能保存副本\n\n![只读图片](attachments/existing.png)\n')
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, documents, drafts: {}, libraries: [{ id: 'external', name: '可写图片库', external: true, available: true, writable: true }, { id: 'readonly', name: '只读图片库', external: true, available: true, writable: false }], images: { [JSON.stringify(['readonly', 'attachments/existing.png'])]: image }, imageFaults: { external: 'unconfirmed' } }))
    localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([{ rootId: 'local', relativePath: 'Attachment.md' }, { rootId: 'external', relativePath: 'Retry.md' }, { rootId: 'external', relativePath: 'Missing.md' }, { rootId: 'readonly', relativePath: 'Readonly.md' }]))
    localStorage.setItem('longedit-attachment-fixture-ready', 'true')
  }, { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: 320, height: 200, bytes: png.length })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
  const note = (state, root, file) => state.documents[JSON.stringify([root, file])]
  async function images() {
    const toolbar = page.getByRole('button', { name: '图片与附件', exact: true })
    if (await toolbar.count()) await toolbar.tap()
    else { await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '添加或修复图片', exact: true }).tap() }
    await page.getByRole('dialog', { name: '图片与附件', exact: true }).waitFor()
  }
  async function choose(file) { await page.getByLabel('选择要导入的图片文件').setInputFiles(path.join(fixture, file)) }
  async function confirmImage() { await page.locator('.image-task-footer').getByRole('button', { name: /^(插入|替换这一处|替换选中)/ }).tap() }
  async function closeImages() { for (let step = 0; step < 6 && await page.locator('.image-attachments').isVisible(); step++) { await page.evaluate(() => window.__longeditMobileBack()); await page.waitForTimeout(50) } }
  async function save() { await page.getByRole('button', { name: '保存', exact: true }).tap(); await page.getByText('已保存到文件', { exact: true }).first().waitFor() }
  async function recent(file) { await page.locator('.library-selector').tap(); await page.locator('.root-option').filter({ hasText: file === 'Readonly.md' ? '只读图片库' : '可写图片库' }).tap(); await page.getByRole('button', { name: '最近', exact: true }).tap(); await page.locator('.file-row').filter({ hasText: file }).tap() }
  async function copy() { if (await page.getByRole('button', { name: '阅读', exact: true }).count()) await readMobileDocument(page); await page.getByRole('button', { name: '文档操作', exact: true }).tap(); await page.getByRole('button', { name: '将副本存入手机资料库', exact: true }).tap() }
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'); await page.locator('.continue-card').tap()
  const original = note(await data(), 'local', 'Attachment.md').content
  await images(); await page.getByLabel('图片说明', { exact: true }).fill('图 [一]'); await choose('diagram.png'); await confirmImage()
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByText('草稿已保护', { exact: true }).waitFor()
  let state = await data(); assert.equal(note(state, 'local', 'Attachment.md').content, original); assert.equal(Object.keys(state.imageImports).length, 1)
  assert.ok(Object.values(state.drafts)[0].content.includes('![图 \\[一\\]](<attachments/'))
  await page.getByRole('button', { name: '撤销', exact: true }).tap(); await page.getByText('与文件一致', { exact: true }).first().waitFor()
  await images(); await page.getByLabel('图片说明', { exact: true }).fill('图 [一]'); await page.getByRole('button', { name: '导入记录', exact: true }).tap(); assert.equal(await page.locator('.image-import-record').count(), 1)
  await page.locator('[data-image-id]').tap(); await confirmImage(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await save()
  state = await data(); assert.equal(Object.keys(state.imageImports).length, 1)
  report.checks.push('PNG import copies bytes and protects only a private draft until explicit save; undo retains the asset and history allows reinsertion without another copy')

  await images(); await page.getByRole('button', { name: /^笔记中的图片/ }).tap(); await page.locator('.image-reference-row').filter({ hasText: '丢失图片' }).tap(); await choose('photo.jpg'); await confirmImage()
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); await save()
  await readMobileDocument(page); await images(); await page.getByLabel('图片说明', { exact: true }).fill('WebP 正向样本'); await choose('sample.webp'); await confirmImage()
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); await save(); await readMobileDocument(page)
  const frame = page.frameLocator('iframe[title="文档阅读"]')
  await frame.getByRole('heading', { name: '附件验收', exact: true }).waitFor()
  for (const alt of ['丢失图片', '图 [一]', 'WebP 正向样本']) { await frame.locator(`img[alt="${alt}"]`).waitFor(); assert.equal(await frame.locator(`img[alt="${alt}"]`).evaluate(img => img.complete && img.naturalWidth), 320) }
  state = await data(); const repaired = note(state, 'local', 'Attachment.md').content
  assert.ok(!repaired.includes('missing.png')); assert.ok(repaired.includes('保留的原文。')); assert.equal(Object.keys(state.images).length, 4)
  await page.screenshot({ path: path.join(output, '360-three-formats.png') })
  report.checks.push('Replacing one missing reference preserves its label and surrounding source, keeps old assets, and PNG/JPEG/WebP decode from imported relative paths')

  await images(); const recordsBefore = Object.keys((await data()).imageImports).length
  for (const [file, message] of [['invalid.png', /图片内容无法识别/], ['too-large.png', /2 MiB/], ['too-many-pixels.png', /800 万像素/]]) {
    await choose(file)
    const alert = page.locator('.image-attachments [role="alert"]').filter({ hasText: message }); await alert.waitFor()
    const box = await alert.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 800, 'Import error must be visible beside the choose action without scrolling past references')
    assert.equal(Object.keys((await data()).imageImports).length, recordsBefore); assert.equal(note(await data(), 'local', 'Attachment.md').content, repaired)
  }
  await page.screenshot({ path: path.join(output, '360-invalid-visible.png') })
  await closeImages(); await page.locator('.reader-header').getByRole('button', { name: /^返回/ }).tap()
  report.checks.push('Spoofed, byte-oversize and pixel-oversize selections fail before asset/record creation and leave saved source unchanged')

  await recent('Retry.md'); const externalOriginal = note(await data(), 'external', 'Retry.md').content
  await images(); await choose('diagram.png'); await page.getByText('导入未确认，正文未改动', { exact: true }).waitFor()
  assert.equal(note(await data(), 'external', 'Retry.md').content, externalOriginal)
  await page.locator('.image-import-preview img').waitFor(); await page.screenshot({ path: path.join(output, '360-unconfirmed-import.png'), fullPage: true })
  await closeImages(); await page.reload(); await recent('Retry.md'); await images(); await page.getByRole('button', { name: '导入记录', exact: true }).tap(); await page.locator('[data-image-id]').tap()
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); delete state.imageFaults.external; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(state)) })
  await page.getByRole('button', { name: '重试导入', exact: true }).tap(); await confirmImage(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await save()
  state = await data(); const externalSaved = note(state, 'external', 'Retry.md').content
  const retryRecord = Object.values(state.imageImports).find(record => record.rootId === 'external'); assert.equal(retryRecord.status, 'ready'); assert.equal(retryRecord.previousPaths.length, 1); assert.equal(retryRecord.candidate, undefined)
  report.checks.push('Explicit unconfirmed-write fixture retains a previewable private candidate across reload; retry uses a fresh target, records the earlier attempt and inserts only after confirmation')

  await copy(); await page.getByText('副本已存入手机资料库，原文和原草稿仍保留。', { exact: true }).waitFor()
  await page.frameLocator('iframe[title="文档阅读"]').locator('img').waitFor()
  state = await data(); assert.equal(note(state, 'external', 'Retry.md').content, externalSaved)
  const portable = Object.values(state.documents).find(doc => doc.rootId === 'local' && doc.relativePath.startsWith('Retry-副本-'))
  assert.ok(portable && portable.content !== externalSaved); assert.ok(portable.content.includes('attachments/longedit-'))
  assert.equal(await page.frameLocator('iframe[title="文档阅读"]').locator('img').evaluate(img => img.complete && img.naturalWidth), 320)
  report.checks.push('Default cross-library note copy copies the referenced image, rewrites its path and remains readable from the local library without changing external source')

  await page.locator('.reader-header').getByRole('button', { name: /^返回/ }).tap(); await recent('Missing.md'); const missingOriginal = note(await data(), 'external', 'Missing.md').content
  await copy(); await page.getByRole('button', { name: '仅存文字副本', exact: true }).waitFor()
  assert.equal(Object.values((await data()).documents).filter(doc => doc.rootId === 'local' && doc.relativePath.startsWith('Missing-副本-')).length, 0)
  await page.getByRole('button', { name: '仅存文字副本', exact: true }).tap(); await page.getByText(/文字副本已存入手机资料库；图片未搬迁/).waitFor()
  assert.equal(note(await data(), 'external', 'Missing.md').content, missingOriginal)
  report.checks.push('A missing image blocks default copy; text-only copy happens only through its explicit action and reports unmigrated images')

  await page.locator('.reader-header').getByRole('button', { name: /^返回/ }).tap(); await recent('Readonly.md'); await images()
  assert.equal(await page.getByRole('button', { name: '选择图片', exact: true }).isDisabled(), true)
  await closeImages(); await copy(); await page.getByText('副本已存入手机资料库，原文和原草稿仍保留。', { exact: true }).waitFor()
  await page.frameLocator('iframe[title="文档阅读"]').locator('img').waitFor()
  assert.equal(await page.frameLocator('iframe[title="文档阅读"]').locator('img').evaluate(img => img.complete && img.naturalWidth), 320)
  await page.setViewportSize({ width: 412, height: 915 }); await page.locator('.reader-header').getByRole('button', { name: /^返回/ }).tap(); await activateMobileRoot(page, '设置'); await openMobileSettingsTransfer(page, '图片导入记录')
  assert.ok(await page.locator('.image-import-record').count() >= 6); await page.screenshot({ path: path.join(output, '412-import-history.png'), fullPage: true })
  assert.ok(await page.locator('.image-import-record').filter({ hasText: '可写图片库 · Retry.md' }).count() >= 1)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  report.checks.push('Read-only notes cannot import into their source; portable local copy works, and settings exposes durable import records with no horizontal overflow')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []); report.passed = true
} catch (error) { report.passed = false; report.failure = String(error?.stack || error); if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); throw error }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
