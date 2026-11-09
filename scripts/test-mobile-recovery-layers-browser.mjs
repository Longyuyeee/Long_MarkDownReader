import { selectRecoveryVersion, selectedRecoveryVersion, readRecoveryPreview, openRecoveryExport } from './mobile-recovery-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const baseline = process.argv.includes('--baseline')
const output = process.env.LONGEDIT_RECOVERY_LAYERS_OUTPUT || `docs/evidence/mobile-0.1.0/recovery-layers-browser-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(path.join(output, '.gitignore'), '*\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'mobile-recovery-parent-tasks', baseline, nativeAndroidTest: false, checks: [], errors: [], scans: [] }
const stateKey = 'longedit-mobile-preview-v1', identity = { rootId: 'outside', relativePath: '行程核对.md' }, key = JSON.stringify(['outside', identity.relativePath])
const original = '\ufeff# 行程核对\r\n\r\n原始内容😀\r\n', candidate = '# 行程核对\n\n杭州 → 苏州\n保留这份未保存输入。\n\n尾行😀'
let page, context
const button = name => page.getByRole('button', { name, exact: true })
const data = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), stateKey)
const protectedDraft = ({ updated, ...draft }) => draft
const back = async () => { await page.evaluate(() => window.__longeditMobileBack()); await page.waitForTimeout(80) }
const shot = name => page.screenshot({ path: path.join(output, name + '.png') })
async function scan(name) {
  await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'))
  const violations = await page.evaluate(async () => (await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(n => n.target) })))
  report.scans.push({ name, violations }); assert.deepEqual(violations, [], name)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}
async function launch() {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ stateKey, identity, key, original }) => {
    if (window !== window.top) return
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify({ version: 1, libraries: [{ id: 'outside', name: '故障测试文件夹', available: true, external: true, writable: true }], documents: { [key]: { ...identity, content: original, signature: 'original', modified: 1 } }, drafts: {}, writeFaults: { outside: 'nospace' } }))
      localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([identity]))
    }
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function() { if (window.__rejectDownload && this.download) throw new Error('测试：下载被阻止'); return click.call(this) }
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function(k) {
      if (k === stateKey && window.__failRead) { window.__failRead = false; throw new Error('测试：记录读取失败') }
      return get.call(this, k)
    }
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function(k, value) {
      const result = set.call(this, k, value)
      if (k === stateKey && window.__blockCopyOpen && Object.values(JSON.parse(value).documents).some(doc => doc.rootId === 'local' && /恢复/.test(doc.relativePath))) {
        window.__blockCopyOpen = false; window.__failRead = true
      }
      return result
    }
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    crypto.subtle.digest = async (...args) => {
      if (window.__holdWrite) { window.__holdWrite = false; await new Promise(resolve => { window.__releaseWrite = resolve }) }
      return digest(...args)
    }
  }, { stateKey, identity, key, original })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.library-selector').tap(); await page.locator('.root-option').filter({hasText:'故障测试文件夹'}).tap(); await page.locator('.file-row').filter({has:page.getByText(identity.relativePath,{exact:true})}).tap(); await button('编辑').tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).fill(candidate)
  await page.getByText('草稿已保护', { exact: true }).waitFor()
}
try {
  await launch(); await button('保存').tap(); await button('查看保存恢复').waitFor()
  const before = await data(), id = Object.keys(before.recoveries)[0]
  const editorNode = await page.locator('.cm-content').elementHandle()
  await button('查看保存恢复').tap(); await page.locator(`[data-recovery-id="${id}"]`).waitFor(); await shot('list')
  await page.locator(`[data-recovery-id="${id}"]`).tap(); await page.getByRole('heading', { name: '核对这次保存', exact: true }).waitFor(); await shot('save')
  if (!baseline) report.geometry = await page.locator('.recovery-task').evaluate(task => {
    const rect = selector => { const el = task.querySelector(selector), box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, fontSize: getComputedStyle(el).fontSize } }
    return { header: rect('.page-heading'), file: rect('.recovery-file'), versionEntry: rect('.recovery-task-row'), primary: rect('.recovery-task-footer .primary-button'), bodyPadding: getComputedStyle(task.querySelector('.recovery-body')).padding }
  })
  await selectRecoveryVersion(page,'写入前的原文'); assert.equal(await readRecoveryPreview(page,'原文内容'), original.replaceAll('\r\n', '\n'))
  await button('刷新恢复记录').tap()
  if (baseline) report.refreshLosesVersion = (await selectedRecoveryVersion(page,'写入前的原文') ? 'true' : 'false') !== 'true'
  else {
    assert.equal((await selectedRecoveryVersion(page,'写入前的原文') ? 'true' : 'false'), 'true')
    await button('恢复记录说明').tap(); await page.getByRole('dialog', { name: '恢复记录说明' }).waitFor(); await back()
    assert.equal((await selectedRecoveryVersion(page,'写入前的原文') ? 'true' : 'false'), 'true')
    assert.equal(await button('恢复记录说明').evaluate(el => el === document.activeElement), true)
    await page.evaluate(() => { window.__failRead = true }); await button('刷新恢复记录').tap(); await page.locator('.recovery-task').getByRole('alert').waitFor()
    assert.equal((await selectedRecoveryVersion(page,'写入前的原文') ? 'true' : 'false'), 'true')
    assert.equal(await readRecoveryPreview(page,'原文内容'), original.replaceAll('\r\n', '\n'))
    report.checks.push('Refreshing and help preserve the selected original version; a failed refresh retains the last readable complete content')
  }
  await back(); await back()
  if (baseline) report.reviewBackLosesEditor = await page.locator('.cm-content').count() === 0
  else {
    assert.equal(await editorNode.evaluate(node => node.isConnected), true)
    assert.equal((await page.locator('.cm-content .cm-line').allTextContents()).join('\n'), candidate)
    assert.equal(await button('查看保存恢复').evaluate(el => el === document.activeElement), true)
    assert.deepEqual(protectedDraft((await data()).drafts[key]), protectedDraft(before.drafts[key]))
    assert.deepEqual((await data()).documents, before.documents); assert.deepEqual((await data()).recoveries, before.recoveries)
    await shot('editor-return')
    report.checks.push('Save recovery Back returns to the same mounted editor and trigger; original bytes, draft revision and recovery record are unchanged')
    await button('撤销').tap()
    assert.notEqual((await page.locator('.cm-content .cm-line').allTextContents()).join('\n'), candidate)
    await button('重做').tap()
    assert.equal((await page.locator('.cm-content .cm-line').allTextContents()).join('\n'), candidate)
    report.checks.push('The source editor retains its actual undo and redo history after recovery inspection')
  }
  await context.close(); await launch()
  await button('文档操作').tap(); await button('导出当前内容副本').tap()
  await page.evaluate(() => { window.__rejectDownload = true }); await button('下载文字副本').tap(); await page.getByRole('alert').waitFor()
  const exportBefore = await data(), exportId = Object.keys(exportBefore.recoveries)[0]
  await button('查看保存恢复记录').tap(); await page.locator(`[data-recovery-id="${exportId}"]`).tap()
  await page.getByRole('heading', { name: '取回这次导出', exact: true }).waitFor(); await shot('export')
  await back(); await back()
  if (baseline) report.reviewBackLosesExport = await page.getByRole('dialog', { name: '导出文字副本', exact: true }).count() === 0
  else {
    await page.getByRole('dialog', { name: '导出文字副本', exact: true }).waitFor()
    await page.getByRole('alert').getByText(/测试：下载被阻止/).waitFor()
    assert.equal(await button('查看保存恢复记录').evaluate(el => el === document.activeElement), true)
    await shot('export-return')
    await page.evaluate(() => { window.__rejectDownload = false })
    const pending = page.waitForEvent('download'); await button('重试下载').tap()
    await (await pending).saveAs(path.join(output, 'export-retry.md'))
    assert.equal(await readFile(path.join(output, 'export-retry.md'), 'utf8'), exportBefore.recoveries[exportId].candidate)
    assert.equal((await data()).recoveries[exportId], undefined)
    assert.deepEqual((await data()).documents, exportBefore.documents)
    assert.deepEqual(protectedDraft((await data()).drafts[key]), protectedDraft(exportBefore.drafts[key]))
    report.checks.push('Export recovery Back restores the exact failed export task and trigger; retry downloads the original snapshot and consumes only its own record')
    await button('返回文档').tap(); await button('保存').tap(); await button('查看保存恢复').tap()
    const recordId = Object.keys((await data()).recoveries)[0]
    await page.locator(`[data-recovery-id="${recordId}"]`).tap()
    await page.setViewportSize({ width: 320, height: 640 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; document.querySelector('.mobile-app').classList.add('theme-dark') })
    await scan('recovery-detail-dark-200'); await shot('detail-dark-200')
    await page.getByRole('button',{name:/^查看完整内容/}).scrollIntoViewIfNeeded()
    await page.getByRole('button',{name:/^导出完整恢复记录/}).scrollIntoViewIfNeeded(); await shot('detail-actions-dark-200')
    await back(); await scan('recovery-list-dark-200')
    await page.setViewportSize({ width: 320, height: 400 }); await page.locator(`[data-recovery-id="${recordId}"]`).tap()
    await page.getByRole('button',{name:/^导出完整恢复记录/}).scrollIntoViewIfNeeded(); await scan('recovery-short-dark-200'); await shot('detail-short-200')
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.getByRole('textbox', { name: '笔记正文', exact: true }).waitFor()
    report.checks.push('Dark 320px at 200% and a short viewport retain readable source and reachable actions; Escape follows detail → list → source task')
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.querySelector('.mobile-app').classList.remove('theme-dark') })
    // Exercise actual nonzero list scroll rather than only a one-row list.
    await page.evaluate(({ stateKey, recordId }) => {
      const state = JSON.parse(localStorage.getItem(stateKey)), record = state.recoveries[recordId]
      for (let n = 0; n < 20; n++) { const id = 'list-fixture-' + n; state.recoveries[id] = { ...record, id, relativePath: `历史-${n}.md`, created: record.created - (n + 1) * 60000 } }
      localStorage.setItem(stateKey, JSON.stringify(state))
    }, { stateKey, recordId })
    await button('查看保存恢复').tap()
    const last = page.locator('[data-recovery-id="list-fixture-19"]'); await last.scrollIntoViewIfNeeded()
    const listTop = await page.locator('.recovery-body').evaluate(el => el.scrollTop); assert.ok(listTop > 500)
    await last.tap(); await selectRecoveryVersion(page,'写入前的原文'); await back()
    assert.equal(await last.evaluate(el => el === document.activeElement), true)
    assert.equal(await page.locator('.recovery-body').evaluate(el => el.scrollTop), listTop)
    await last.tap(); assert.equal((await selectedRecoveryVersion(page,'写入前的原文') ? 'true' : 'false'), 'true')
    await back(); await back()
    report.checks.push('A 21-record list restores its nonzero scroll and selected row; reopening a record retains its chosen version')
    await button('查看保存恢复').tap(); await page.locator(`[data-recovery-id="${recordId}"]`).tap()
    const copyBefore = await data()
    const recoveryDownload = page.waitForEvent('download'); await openRecoveryExport(page); await button('下载恢复记录').tap()
    await (await recoveryDownload).saveAs(path.join(output, 'exported-recovery.json'))
    const exportedRecord = JSON.parse(await readFile(path.join(output, 'exported-recovery.json'), 'utf8'))
    assert.equal(exportedRecord.original, original); assert.equal(exportedRecord.candidate, copyBefore.recoveries[recordId].candidate)
    await page.locator('.recovery-task').getByRole('status').getByText('浏览器已开始下载恢复记录，原记录继续保留。', { exact: true }).waitFor()
    await back()
    report.checks.push('Recovery export reports its result inside the active task and downloads both complete versions without consuming their record')
    await page.evaluate(() => { window.__holdWrite = true; window.__blockCopyOpen = true })
    await button('将草稿副本存入手机资料库').tap(); await page.waitForFunction(() => !!window.__releaseWrite)
    await back(); await back(); assert.equal(await page.locator('.recovery-task').count(), 1)
    assert.equal(await button('将草稿副本存入手机资料库').isDisabled(), true)
    await page.evaluate(() => window.__releaseWrite())
    await page.locator('.recovery-task').getByRole('alert').getByText(/副本已存入手机资料库，打开未完成/).waitFor()
    const failed = await data(), copies = Object.values(failed.documents).filter(doc => doc.rootId === 'local')
    assert.equal(copies.length, 1); assert.equal(copies[0].content, copyBefore.recoveries[recordId].candidate)
    assert.equal(failed.documents[key].content, original)
    assert.deepEqual(protectedDraft(failed.drafts[key]), protectedDraft(copyBefore.drafts[key]))
    assert.deepEqual(failed.recoveries, copyBefore.recoveries)
    assert.equal(await button('查看保存恢复').count(), 1, 'Failed admission must retain the source save-error action')
    await shot('copy-open-failed'); await scan('copy-admission-failure')
    report.checks.push('Busy copying consumes repeated Back; failed admission retains the complete saved copy, original editor draft and all recovery records')
    await button('打开已存副本').tap(); await page.locator('.reader-header h1').filter({ hasText: '草稿恢复' }).waitFor()
    const afterRetry = await data()
    assert.equal(Object.values(afterRetry.documents).filter(doc => doc.rootId === 'local').length, 1)
    assert.deepEqual(afterRetry.recoveries, copyBefore.recoveries)
    assert.equal(afterRetry.documents[key].content, original)
    assert.equal(await page.locator('.recovery-task').count(), 0)
    assert.equal(await page.getByRole('dialog', { name: '导出文字副本', exact: true }).count(), 0)
    report.checks.push('Retry admits the existing complete copy without creating another file; only successful explicit admission replaces the source task')
  }
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2)) }
