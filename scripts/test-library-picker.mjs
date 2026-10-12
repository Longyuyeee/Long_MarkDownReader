import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = 'docs/evidence/v110-library-picker'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch(), errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:9000/scripts/fixtures/library-shell-browser.html')
  await page.locator('.vditor-wysiwyg').getByText('让记录更顺手', { exact: true }).waitFor()
  await page.evaluate(() => window.shellAudit.store.libraries.push({ name: '个人资料库', path: 'C:/personal-fixture' }))
  const picker = page.getByRole('button', { name: '切换资料库', exact: true })
  await picker.click()
  await page.getByText('个人资料库', { exact: true }).waitFor()
  await page.getByText('管理资料库…', { exact: true }).waitFor()
  await page.screenshot({ path: output + '/dropdown.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.evaluate(() => { window.shellAudit.store.tabs[0].isDirty = true })
  await picker.click()
  await page.getByText('个人资料库', { exact: true }).click()
  await page.getByText('有未保存的文档，请先保存后再切换资料库。', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.shellAudit.store.libraryPath), 'C:/shell-fixture')
  assert.equal(await page.evaluate(() => window.shellAudit.store.tabs.length), 2)
  await page.evaluate(() => { window.shellAudit.store.tabs.forEach(t => { t.isDirty = false }) })
  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'save_config') {
        window.__TAURI_INTERNALS__.invoke = original
        throw new Error('Simulated config failure')
      }
      return original(command, args)
    }
  })
  await picker.click()
  await page.getByText('个人资料库', { exact: true }).click()
  await page.getByText(/切换资料库失败/).waitFor()
  assert.equal(await page.evaluate(() => window.shellAudit.store.libraryPath), 'C:/shell-fixture')
  assert.equal(await page.evaluate(() => window.shellAudit.store.tabs.length), 2)
  await picker.click()
  await page.getByText('个人资料库', { exact: true }).click()
  await page.waitForFunction(() => window.shellAudit.store.libraryPath === 'C:/personal-fixture')
  assert.ok((await picker.innerText()).includes('个人资料库'))
  await picker.click()
  await page.getByText('工作资料库', { exact: true }).click()
  await page.waitForFunction(() => window.shellAudit.store.libraryPath === 'C:/shell-fixture')
  assert.equal(await page.evaluate(() => window.shellAudit.store.tabs.length), 2)
  await page.setViewportSize({ width: 480, height: 800 })
  await page.getByText(/切换资料库失败/).waitFor({ state: 'hidden' })
  await picker.click()
  await page.getByText('个人资料库', { exact: true }).waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: output + '/narrow.png', animations: 'disabled' })
  assert.deepEqual(errors, [])
  await fs.writeFile(output + '/results.json', JSON.stringify({ checks: ['Dropdown lists libraries and management', 'Dirty document blocks switching without loss', 'Config failure retains library and tabs; retry works', 'Direct switch updates active library', 'Switching back restores tabs', 'Narrow screen dropdown'], errors, scope: 'Actual Vue, mocked native IPC' }, null, 2) + '\n')
  console.log('Library picker passed')
} finally { await browser.close() }
