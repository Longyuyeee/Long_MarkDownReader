import { selectRecoveryVersion, openRecoveryPreview, readRecoveryPreview, openRecoveryExport } from './mobile-recovery-navigation.mjs'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')
const output = `docs/evidence/mobile-0.1.0/write-recovery-browser-${Date.now()}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { kind: 'preview-save-fault-and-recovery-tasks', nativeAndroidTest: false, checks: [], errors: [], externalRequests: [], scans: [] }
const root = 'fault-test', identity = { rootId: root, relativePath: '保存验收.md' }, key = JSON.stringify([root, identity.relativePath])
const small = '# 原文\n\n原始中文内容必须保留。\n'
const large = '# Interrupted original\r\n\r\n' + 'Original 中文😀\r\n'.repeat(8192) + 'TailRecover\r\n保留最后一句。\r\n'
let page, context
async function launch(fault, original) {
  context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ original, fault, root, identity, key }) => {
    if (window !== window.top || localStorage.getItem('longedit-fault-ready')) return
    localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify({ version: 1, libraries: [{ id: root, name: '故障测试文件夹', external: true, writable: true, available: true }], documents: { [key]: { ...identity, content: original, signature: 'fixture-original', modified: 1 } }, drafts: {}, writeFaults: { [root]: fault } }))
    localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([identity])); localStorage.setItem('longedit-fault-ready', 'true')
  }, { original, fault, root, identity, key })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') report.externalRequests.push(request.url()) })
  await page.goto(process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html')
  await page.locator('.library-selector').tap(); await page.locator('.root-option').filter({hasText:'故障测试文件夹'}).tap(); await page.locator('.file-row').filter({hasText:identity.relativePath}).tap(); await page.getByRole('button', { name: '编辑', exact: true }).tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).focus(); await page.keyboard.press('Control+Home'); await page.keyboard.type('RecoveryDraft')
  await page.getByText('草稿已保护', { exact: true }).waitFor()
  await page.getByRole('button', { name: '保存', exact: true }).tap()
  await page.getByRole('button', { name: '查看保存恢复', exact: true }).waitFor()
}
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
async function inspect(id) {
  await page.locator(`[data-recovery-id="${id}"]`).tap()
  await page.getByRole('heading', { name: '核对这次保存', exact: true }).waitFor()
}
async function center() {
  await page.locator('.reader-header').getByRole('button', { name: /^返回/ }).tap()
  await page.getByRole('button', { name: '设置', exact: true }).tap()
  await page.getByRole('button', { name: '保存恢复记录', exact: true }).tap()
}
try {
  await launch('nospace', small)
  let state = await data(), record = Object.values(state.recoveries)[0]
  assert.equal(state.documents[key].content, small); assert.equal(state.drafts[key].content, 'RecoveryDraft' + small)
  assert.equal(record.original, small); assert.equal(record.candidate, 'RecoveryDraft' + small)
  await page.getByText(/文件提供器报告空间不足/).waitFor()
  assert.ok(await page.locator('.mobile-notice > span').evaluate(element => element.getBoundingClientRect().width) >= 280, 'Error text must keep a readable width above its actions')
  await page.screenshot({ path: path.join(output, '412-quota-notice.png') })
  await page.setViewportSize({ width: 360, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.getByRole('button', { name: '查看保存恢复', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, '360-quota-notice-200.png') })
  await page.getByRole('button', { name: '查看保存恢复', exact: true }).tap()
  await page.setViewportSize({ width: 412, height: 915 }); await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  await page.locator(`[data-recovery-id="${record.id}"]`).waitFor()
  assert.equal((await data()).drafts[key].content, record.candidate)
  assert.match(await page.locator(`[data-recovery-id="${record.id}"]`).innerText(), /故障测试文件夹/)
  report.checks.push('Quota refusal leaves source unchanged and protects the candidate; the save-error action opens recovery without discarding the editor draft')
  await inspect(record.id)
  assert.equal(await page.getByRole('heading', { name: '核对这次保存', exact: true }).evaluate(element => element === document.activeElement), true)
  await selectRecoveryVersion(page,'写入前的原文')
  assert.equal(await readRecoveryPreview(page,'原文内容'), small)
  await page.getByRole('button', { name: '返回恢复记录', exact: true }).tap()
  assert.equal(await page.locator(`[data-recovery-id="${record.id}"]`).evaluate(element => element === document.activeElement), true)
  await inspect(record.id); await selectRecoveryVersion(page,'写入前的原文')
  await page.getByRole('button', { name: '将原文副本存入手机资料库', exact: true }).tap()
  await page.frameLocator('iframe').getByRole('heading', { name: '原文', exact: true }).waitFor()
  state = await data(); assert.ok(Object.values(state.documents).some(document => document.rootId === 'local' && document.content === small)); assert.ok(state.recoveries[record.id]); assert.equal(state.documents[key].content, small)
  report.checks.push('Version review identifies its folder and restores heading/list focus; original rescue creates an exact independent local copy and retains the record')
  await context.close()
  await launch('partial', large)
  state = await data(); record = Object.values(state.recoveries)[0]
  assert.equal(state.documents[key].content, record.candidate.slice(0, 8)); assert.equal(record.original, large)
  await page.reload(); await page.locator('.library-selector').tap(); await page.locator('.root-option').filter({hasText:'故障测试文件夹'}).tap(); await page.locator('.file-row').filter({hasText:identity.relativePath}).tap(); await page.getByRole('button', { name: '继续这份草稿', exact: true }).tap()
  await page.getByRole('textbox', { name: '笔记正文', exact: true }).waitFor()
  assert.equal((await data()).drafts[key].content, record.candidate)
  await center(); await inspect(record.id)
  await openRecoveryPreview(page)
  const source = page.getByRole('region', { name: '草稿内容', exact: true })
  await source.locator('.source-page-content').waitFor(); assert.ok((await source.locator('.source-page-text').textContent()).length <= 16384)
  assert.ok(await source.locator('.source-page-content').evaluate(element => element.clientHeight) >= 192, 'Recovery controls must not squeeze away the actual content')
  await page.getByRole('textbox', { name: '查找恢复内容', exact: true }).fill('TailRecover')
  await source.locator('mark').filter({ hasText: 'TailRecover' }).waitFor()
  await page.screenshot({ path: path.join(output, '412-recovery-tail.png') })
  await page.evaluate(()=>window.__longeditMobileBack()); await selectRecoveryVersion(page,'写入前的原文'); await openRecoveryPreview(page)
  await page.getByRole('region', { name: '原文内容', exact: true }).locator('.source-page-content').waitFor()
  assert.equal(await page.getByRole('textbox', { name: '查找恢复内容', exact: true }).inputValue(), '')
  report.checks.push('A simulated partial source still recovers the complete draft after reload; large recovery versions are bounded, searchable to the tail, and isolated when switched')
  const download = page.waitForEvent('download')
  await page.evaluate(()=>window.__longeditMobileBack()); await openRecoveryExport(page); await page.getByRole('button',{name:'下载恢复记录',exact:true}).tap()
  await (await download).saveAs(path.join(output, 'exported-recovery.json'))
  const exported = JSON.parse(await readFile(path.join(output, 'exported-recovery.json'), 'utf8'))
  assert.equal(exported.original, large); assert.equal(exported.candidate, record.candidate)
  assert.equal(exported.libraryName, '故障测试文件夹')
  report.checks.push('Export downloads both full mixed-ending versions and source-folder metadata without consuming the private record')
  await page.evaluate(()=>window.__longeditMobileBack()); await selectRecoveryVersion(page,'准备保存的草稿')
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); state.writeFaults.local = 'nospace'; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(state)) })
  await page.getByRole('button', { name: '将草稿副本存入手机资料库', exact: true }).tap()
  await page.getByRole('alert').getByText(/文件提供器报告空间不足/).waitFor()
  assert.equal((await data()).recoveries[record.id].candidate, record.candidate)
  assert.equal((await page.getByRole('button',{name:/^恢复版本/}).innerText()).includes('准备保存的草稿') ? 'true' : 'false', 'true')
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')); delete state.writeFaults.local; localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(state)) })
  await page.getByRole('button', { name: '将草稿副本存入手机资料库', exact: true }).tap()
  await page.getByText('副本已存入手机资料库，原文件和恢复记录继续保留。', { exact: true }).waitFor()
  state = await data(); assert.ok(Object.values(state.documents).some(document => document.rootId === 'local' && document.content === record.candidate)); assert.equal(state.documents[key].content, record.candidate.slice(0, 8)); assert.ok(state.recoveries[record.id])
  report.checks.push('A failed rescue copy keeps the selected version and record; retry creates a complete local candidate while the partial external source is untouched')
  await center(); await inspect(record.id); await openRecoveryPreview(page)
  await page.setViewportSize({ width: 360, height: 800 }); await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
  assert.ok(await page.locator('.recovery-source .source-page-content').evaluate(element => element.clientHeight) >= 384, 'Recovery text must retain reading space at 200%')
  await page.evaluate(axeSource)
  const scan = await page.evaluate(async () => { const result = await axe.run(document, { iframes: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return { violations: result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), incomplete: result.incomplete.map(({ id }) => id) } })
  report.scans.push(scan); assert.deepEqual(scan.violations, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, '360-recovery-200.png') })
  await page.locator('.recovery-source .source-page-content').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, '360-recovery-content-200.png') })
  report.checks.push('Large recovery review at 200% text remains within the viewport and passes the selected accessibility rules; native TalkBack remains separate')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, [])
  report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, checks: report.checks, passed: report.passed, failure: report.failure }, null, 2)) }
