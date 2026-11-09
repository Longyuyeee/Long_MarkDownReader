import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_MOBILE_EVIDENCE_DIRECTORY || `docs/evidence/mobile-0.1.0/boundaries-browser-${Date.now()}`
const url = process.env.LONGEDIT_MOBILE_PREVIEW_URL || 'http://127.0.0.1:9012/mobile.html'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const identity = { rootId: 'external-test', relativePath: '断开后继续.md' }, key = JSON.stringify([identity.rootId, identity.relativePath])
const original = '# 原文\n\n仍在原来的文件夹。', candidate = '# 我的阅读笔记\n\n授权失效后，继续写下这段理解。'
const recoveryId = '12345678-1234-4234-8234-123456789abc'
const record = { id: recoveryId, rootId: identity.rootId, relativePath: '恢复样例.md', original: '# 写入前的原文\n\n旧内容。', candidate: '# 准备保存的草稿\n\n恢复内容。', created: Date.now(), hasOriginal: true, readable: true }
const fixture = { version: 1, libraries: [{ id: identity.rootId, name: '读书文件夹', external: true, available: true, writable: true }], documents: { [key]: { ...identity, content: original, signature: 'fixture-signature', modified: Date.now() } }, drafts: {}, recoveries: { [recoveryId]: record } }
const report = { kind: 'browser-preview-boundary-fixtures', nativeAndroidTest: false, checks: [], errors: [] }
let page
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  await context.addInitScript(({ fixture, identity }) => {
    if (window.top !== window) return
    if (!localStorage.getItem('longedit-mobile-preview-v1')) {
      localStorage.setItem('longedit-mobile-preview-v1', JSON.stringify(fixture))
      localStorage.setItem('longedit-mobile-recent-v1', JSON.stringify([identity]))
    }
  }, { fixture, identity })
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error)))
  await page.goto(url); await page.locator('.continue-card').tap(); await page.getByRole('button', { name: '编辑', exact: true }).tap()
  await page.getByLabel('笔记正文').fill(candidate); await page.getByText('草稿已保护', { exact: true }).waitFor()
  await page.getByRole('button', { name: '返回资料库' }).tap()
  await page.locator('.library-selector').tap(); await page.getByLabel('停止访问 读书文件夹', { exact: true }).tap()
  await page.getByRole('button', { name: '继续访问', exact: true }).tap()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')).libraries[0].available), true)
  await page.getByLabel('停止访问 读书文件夹', { exact: true }).tap(); await page.getByRole('button', { name: '停止访问', exact: true }).tap()
  await page.getByText('已停止访问文件夹；原文件和私有草稿都保留。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '关闭面板' }).tap(); await page.getByRole('button', { name: '关闭提示' }).tap()
  await page.locator('.continue-card').tap()
  await page.getByText('原资料暂不可用，私有草稿仍能继续。可以将副本存入手机资料库，再重新授权原文件夹。', { exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, 'permission-recovery.png'), fullPage: true })
  await page.getByRole('button', { name: '继续这份草稿' }).tap(); await page.getByRole('button', { name: '存入手机库', exact: true }).tap()
  await page.getByText('副本已存入手机资料库，原文和原草稿仍保留。', { exact: true }).waitFor()
  let data = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
  assert.equal(data.documents[key].content, original); assert.equal(data.drafts[key].content, candidate)
  assert.ok(Object.values(data.documents).some(document => document.rootId === 'local' && document.content === candidate))
  report.checks.push('Cancel disconnect preserves access; actual disconnect fixture keeps private draft recoverable and copies it to the local library without touching its source')
  await page.getByRole('button', { name: '关闭提示' }).tap()
  await page.getByLabel('笔记正文').fill(candidate + '\n这一句后来撤销。'); await page.getByText('草稿已保护', { exact: true }).waitFor()
  await page.getByLabel('笔记正文').fill(candidate); await page.getByRole('button', { name: '返回资料库' }).tap()
  await page.locator('.continue-card').tap(); await page.frameLocator('iframe').getByRole('heading', { name: '我的阅读笔记' }).waitFor()
  assert.equal(await page.getByRole('button', { name: '继续这份草稿' }).count(), 0)
  report.checks.push('Undo to the saved source clears obsolete recovery input on navigation')
  await page.getByRole('button', { name: '返回资料库' }).tap(); await page.getByRole('button', { name: '设置', exact: true }).tap()
  await page.getByRole('button', { name: '保存恢复记录', exact: true }).tap(); await page.getByRole('button', { name: /恢复样例.md/ }).tap()
  await page.getByRole('button', { name: '写入前的原文', exact: true }).tap(); assert.equal(await page.getByLabel('原文内容', { exact: true }).inputValue(), record.original)
  await page.screenshot({ path: path.join(output, 'recovery-original.png'), fullPage: true })
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出完整恢复记录' }).tap()
  await (await download).saveAs(path.join(output, 'exported-recovery.json'))
  const exported = JSON.parse(await readFile(path.join(output, 'exported-recovery.json'), 'utf8'))
  assert.equal(exported.original, record.original); assert.equal(exported.candidate, record.candidate); assert.equal(exported.format, 'longedit-write-recovery')
  await page.getByRole('button', { name: '将原文副本存入手机资料库' }).tap(); await page.getByText('副本已存入手机资料库，原文件和恢复记录继续保留。', { exact: true }).waitFor()
  await page.frameLocator('iframe').getByRole('heading', { name: '写入前的原文', exact: true }).waitFor()
  data = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
  assert.ok(Object.values(data.documents).some(document => document.rootId === 'local' && document.content === record.original)); assert.ok(data.recoveries[recoveryId])
  report.checks.push('Recovery journal shows both versions, exports complete JSON, and saves an original copy while retaining the journal')
  await page.getByRole('button', { name: '关闭提示' }).tap(); await page.getByRole('button', { name: '返回资料库' }).tap()
  await page.getByRole('button', { name: '设置', exact: true }).tap(); await page.getByRole('button', { name: '保存恢复记录', exact: true }).tap()
  await page.getByRole('button', { name: /恢复样例.md/ }).tap(); await page.getByRole('button', { name: '将草稿副本存入手机资料库' }).tap()
  await page.getByText('副本已存入手机资料库，原文件和恢复记录继续保留。', { exact: true }).waitFor()
  await page.frameLocator('iframe').getByRole('heading', { name: '准备保存的草稿', exact: true }).waitFor()
  data = await page.evaluate(() => JSON.parse(localStorage.getItem('longedit-mobile-preview-v1')))
  assert.ok(Object.values(data.documents).some(document => document.content === record.candidate)); assert.ok(data.recoveries[recoveryId]); assert.equal(data.documents[key].content, original)
  report.checks.push('Candidate copy is distinct from original copy and never overwrites the external source')
  assert.deepEqual(report.errors, []); report.passed = true
} catch (error) {
  report.passed = false; report.failure = String(error); process.exitCode = 1
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify({ output, ...report }, null, 2))
}
