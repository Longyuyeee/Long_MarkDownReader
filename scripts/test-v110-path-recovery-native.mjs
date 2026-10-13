import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_E2E_LIBRARY, output = process.env.LONGEDIT_PATH_RECOVERY_OUTPUT
if (!root || !root.includes('longedit-v110-path-') || !output || !process.env.LONGEDIT_E2E_CONFIG_DIR) throw Error('Isolated runner required')
const fixtureBase = path.dirname(path.resolve(root))
assert.match(path.basename(fixtureBase), /^longedit-v110-path-[a-f0-9]{32}$/i)
assert.equal(path.dirname(fixtureBase).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase())
assert.equal(path.basename(path.resolve(root)), 'library')
let browser
for (let i = 0; i < 100; i++) {
  try { browser = await chromium.connectOverCDP(process.env.LONGEDIT_CDP_ENDPOINT); break } catch { await new Promise(r => setTimeout(r, 100)) }
}
if (!browser) throw Error('Native WebView unavailable')
const checks = [], errors = [], calls = []
try {
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(10000)
  page.on('pageerror', e => errors.push(e.message))
  const folderErrors = []
  page.on('console', message => { if (message.type() === 'error') folderErrors.push(message.text()) })
  await page.locator('.library-file-tree').getByText('Note.md', { exact: true }).waitFor()
  const childRoot = path.join(root, 'Project'), displaced = path.join(root, 'Project-away')
  await fs.rename(childRoot, displaced)
  const folder = page.locator('.library-file-tree .n-tree-node').filter({ hasText: 'Project' }).first()
  await folder.locator('.n-tree-node-switcher').click()
  await page.waitForTimeout(500)
  assert.ok(folderErrors.some(message => /Failed to load directory|handleLoadChildren/.test(message)), 'Folder scan should report the actual native failure')
  await fs.rename(displaced, childRoot)
  if (await folder.locator('.n-tree-node-switcher--expanded').count()) await folder.locator('.n-tree-node-switcher').click()
  await folder.locator('.n-tree-node-switcher').click()
  await page.locator('.library-file-tree').getByText('Child.md', { exact: true }).waitFor()
  checks.push('Moved folder causes real scan failure; restoring and expanding retries instead of caching empty children')
  await fs.mkdir(output, { recursive: true })
  await page.screenshot({ path: path.join(output, 'folder-recovered.png') })
  // Missing root remains local and retry recovers once it returns.
  const rootAway = root + '-away'
  await fs.rename(root, rootAway)
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await page.getByText('知识库目录暂时不可用', { exact: true }).waitFor()
  assert.equal(await page.locator('#crash-screen, #app-startup-screen').count(), 0)
  await fs.rename(rootAway, root)
  await page.getByRole('button', { name: '重试读取', exact: true }).click()
  await page.locator('.library-file-tree').getByText('Note.md', { exact: true }).waitFor()
  checks.push('Missing root stays in sidebar; real retry restores files and navigation')
  // A listed file can move between scan and click; it must show read-only failure
  // and load again after returning, without a full-window error overlay.
  const file = path.join(root, 'Note.md'), fileAway = path.join(root, 'Note-away.md')
  await fs.rename(file, fileAway)
  await page.locator('.library-file-tree').getByText('Note.md', { exact: true }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(output, 'file-unavailable.png') })
  await page.getByText('读取失败 · 只读', { exact: false }).first().waitFor()
  await fs.rename(fileAway, file)
  await page.getByTestId('library-document-menu').click()
  await page.getByRole('button', { name: '从磁盘同步内容', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.vditor-wysiwyg [contenteditable="true"]'))
  assert.equal(await page.locator('#crash-screen, #app-startup-screen').count(), 0)
  assert.ok((await page.locator('.vditor-wysiwyg').innerText()).trim().length > 0)
  checks.push('File moved after listing produces recoverable read failure; reload uses real restored file')
  await page.getByText('已同步磁盘最新内容', { exact: true }).waitFor({ state: 'hidden' })
  // A real edited draft survives cancel and a confirmed reload with the path
  // unavailable; it is replaced only after a successful, explicitly confirmed read.
  const editor = page.locator('.vditor-wysiwyg [contenteditable="true"]').first()
  await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' native draft')
  await page.waitForFunction(() => document.querySelector('.document-save-state')?.textContent.includes('未保存'))
  const draft = await page.locator('.vditor-wysiwyg').innerText()
  const reload = async () => {
    await page.getByTestId('library-document-menu').click()
    await page.getByRole('button', { name: '从磁盘同步内容', exact: true }).click()
  }
  await reload()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await page.locator('.vditor-wysiwyg').innerText(), draft)
  await fs.rename(file, fileAway)
  await reload()
  await page.getByRole('button', { name: '继续重读', exact: true }).click()
  await page.getByText(/读取失败，已保留当前内容/).first().waitFor()
  assert.equal(await page.getByText('已同步磁盘最新内容', { exact: true }).count(), 0)
  assert.equal(await page.locator('.vditor-wysiwyg').innerText(), draft)
  assert.ok((await page.locator('.document-save-state').innerText()).includes('未保存'))
  await page.getByRole('button', { name: '继续重读', exact: true }).waitFor({ state: 'hidden' })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(output, 'draft-preserved.png') })
  await fs.rename(fileAway, file)
  await reload()
  await page.getByRole('button', { name: '继续重读', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.document-save-state')?.textContent === '已保存')
  assert.ok(!(await page.locator('.vditor-wysiwyg').innerText()).includes('native draft'))
  checks.push('Cancel and failed native reload retain unsaved draft; successful confirmed reload replaces it')
  await page.screenshot({ path: path.join(output, 'file-recovered.png') })
  calls.push(...folderErrors)
  assert.deepEqual(errors, [])
  const productSourceSha256 = Object.fromEntries(await Promise.all(['src/views/LibraryMode.vue', 'src/components/WorkspaceErrorBoundary.vue', 'src/services/runtimeErrorNotice.ts', 'public/app-recovery.js'].map(async file => [file, createHash('sha256').update(await fs.readFile(file)).digest('hex')])))
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors, failures: calls, baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), productSourceSha256, scope: 'Isolated debug Tauri/WebView2, actual UI events and real IPC/filesystem; no desktop focus/input takeover. Not installer acceptance.' }, null, 2) + '\n')
  console.log(JSON.stringify({ checks, errors }))
} finally { await browser.close() }
