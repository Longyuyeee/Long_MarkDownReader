import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v115-safe-import-development'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.LONGEDIT_BROWSER_CHANNEL || undefined })
const errors = [], checks = [], layouts = [], page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000)
const drop = paths => page.evaluate(paths => window.workflowAudit.nativeEvent('tauri://drag-drop', { paths, position: { x: 200, y: 300 } }), paths)
try {
  await page.goto((process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9015') + '/scripts/fixtures/external-import-browser.html')
  await page.getByRole('link', { name: '资料库', exact: true }).click()
  await page.waitForFunction(() => window.workflowAudit.listeners.some(item => item.event === 'tauri://drag-drop'))
  await drop(['C:/external/会议记录.md', 'C:/external/项目方案.md'])
  const modal = page.locator('.external-import-dialog'); await modal.waitFor()
  assert.match(await modal.textContent(), /会议记录\.md/); assert.match(await modal.textContent(), /已完成/)
  assert.match(await modal.textContent(), /images\/流程\.png/); assert.equal(await modal.getByRole('button', { name: '重试未完成的 1 项' }).isVisible(), true)
  const before = await page.evaluate(() => window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md'))
  assert.match(before, /让阅读、记录/)
  checks.push('External-drop callback opens the actual result dialog with individual success and missing-image failure, preserving existing fixture content')
  for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) for (const width of [1280, 480]) {
    await page.setViewportSize({ width, height: 900 }); await page.evaluate(style => { window.workflowAudit.store.visualStyle = style; window.workflowAudit.store.theme = style === 'glass' ? 'dark' : 'green'; document.documentElement.dataset.style = style }, style)
    const box = await modal.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
    assert.ok(await modal.getByRole('button', { name: '重试未完成的 1 项' }).isVisible()); layouts.push({ style, width, dialogFits: true })
  }
  await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: output + '/partial-result.png' })
  await page.evaluate(() => { window.workflowAudit.importFails = false })
  await modal.getByRole('button', { name: '重试未完成的 1 项' }).click(); await modal.waitFor({ state: 'hidden' })
  const imports = await page.evaluate(() => window.workflowAudit.calls.filter(item => item.command === 'import_library_files'))
  assert.deepEqual(imports[1].args.sourcePaths, ['C:/external/项目方案.md'])
  assert.equal(await page.evaluate(() => window.workflowAudit.disk.get('C:/workflow-fixture/项目方案.md')), before)
  checks.push('Retry submits only the failed source; successful import is not duplicated and existing document remains unchanged')
  await page.evaluate(() => { window.workflowAudit.importRefreshFails = true })
  await drop(['C:/external/调研.md']); await modal.waitFor(); assert.match(await modal.textContent(), /列表刷新未完成/)
  assert.equal(await modal.getByRole('button', { name: /重试未完成/ }).count(), 0)
  checks.push('A post-import list-refresh error is not reported as file failure and offers no dangerous import retry')
  await modal.getByRole('button', { name: '关闭', exact: true }).click(); assert.deepEqual(errors, [])
  await fs.writeFile(output + '/report.json', JSON.stringify({ scope: 'Actual LibraryMode drop callback and Vue dialog; native IPC simulated. Real filesystem tested separately.', motion: 'calm (normal animations enabled)', checks, layouts, errors }, null, 2) + '\n')
  console.log(JSON.stringify({ checks: checks.length, layouts: layouts.length, errors: errors.length }))
} catch (error) { await page.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error }
finally { await browser.close() }
