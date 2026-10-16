import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v117-metadata-recovery/selector'
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9000'
const selector = '.text-history-entries > button, .text-history-entries .history-version-button'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/scripts/fixtures/save-history-v117-browser.html', base).href)
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.evaluate(async () => {
    const a = window.workflowAudit
    a.history = [[100, '第一版原文，必须恢复这一版'], [101, '第二版内容']]
    a.metadata[a.store.libraryPath + '/记录.txt'] = {100:{pinned:true,note:'提交前'}}
    const invoke = window.__TAURI_INTERNALS__.invoke
    a.listBusy = false; a.metadataWhileListBusy = 0
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'list_history' && !a.releaseAllLists) {
        a.listBusy = true
        await new Promise(resolve => { a.finishList = resolve })
        a.listBusy = false
      }
      if (command === 'get_history_metadata' && a.listBusy) {
        a.metadataWhileListBusy++
        throw Error('历史记录正在读取，请重试')
      }
      return invoke(command,args)
    }
    await a.router.push({ name: 'LibraryMode', query: { path: a.store.libraryPath + '/记录.txt' } })
  })
  await page.locator('.text-workspace .cm-content').waitFor()
  const original = await page.locator('.text-workspace .cm-content').innerText()
  await page.locator('.text-toolbar').getByRole('button', { name: '历史与差异', exact: true }).click()
  await page.waitForFunction(() => !!window.workflowAudit.finishList)
  assert.equal(await page.evaluate(() => window.workflowAudit.metadataWhileListBusy), 0)
  await page.evaluate(() => window.workflowAudit.finishList())
  await page.locator('.history-version-row').nth(1).waitFor()
  await page.locator('.history-version-row .pinned').waitFor()
  assert.equal(await page.locator('.text-history-entries button').count(), 4, 'old driver counts the two extra menu controls')
  assert.equal(await page.locator(selector).count(), 2, 'still require exactly two real versions')
  await page.screenshot({ path: output + '/two-versions-four-controls.png' })
  await page.locator(selector).last().click()
  const diff = page.locator('.history-diff-dialog'); await diff.waitFor()
  assert.match(await diff.innerText(), /第一版原文，必须恢复这一版/)
  assert.equal(await page.locator('.text-workspace .cm-content').innerText(), original)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: output + '/oldest-version-compared.png' })
  await diff.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.evaluate(() => { window.workflowAudit.releaseAllLists = true; window.workflowAudit.failMetadata = true })
  await page.locator('.text-toolbar').getByRole('button', { name: '历史与差异', exact: true }).click()
  const history = page.locator('.history-version-list')
  await history.getByRole('alert').filter({ hasText: '模拟备注读取失败' }).waitFor()
  await history.locator('.n-select').click()
  await page.getByText('已保留', { exact: true }).click()
  await page.locator('.n-base-select-menu').waitFor({ state: 'hidden' })
  assert.equal(await history.locator('.history-empty').count(), 0, 'metadata failure is not an empty pinned result')
  await page.screenshot({ path: output + '/metadata-error-not-empty.png' })
  await page.evaluate(() => { window.workflowAudit.failMetadata = false })
  await history.getByRole('button', { name: '重试', exact: true }).click()
  await history.locator('.pinned').waitFor()
  assert.equal(await history.getByRole('alert').count(), 0)
  assert.equal(await history.locator('.history-version-row').count(), 1)
  assert.deepEqual(errors, [])
  await fs.writeFile(output + '/report.json', JSON.stringify({
    scope: 'Actual Vue TXT history with simulated IPC; selector verification, not installed validation',
    oldBroadButtonCount: 4, historyVersionCount: 2,
    oldestVersionCompared: true, editorUnchanged: true, metadataDeferredUntilListReady: true,
    metadataFailureNotEmpty: true, retryKeepsPinAndNote: true, errors,
  }, null, 2) + '\n')
  console.log('PASS: two real history entries, four controls; oldest version compares without replacing the editor')
} finally { await browser.close() }
