import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.LONGEDIT_E2E_LIBRARY
if (!root || !path.basename(path.dirname(root)).startsWith('longedit-inbox-')) throw Error('An isolated inbox fixture is required')
const output = 'docs/evidence/v111-inbox-native'
await fs.mkdir(output, { recursive: true })
let browser
for (let i = 0; i < 80; i++) {
  try { browser = await chromium.connectOverCDP(process.env.LONGEDIT_CDP_ENDPOINT); break } catch { await new Promise(r => setTimeout(r, 100)) }
}
if (!browser) throw Error('Native WebView did not start')
const checks = [], errors = []
try {
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('.library-file-tree').waitFor()
  await page.locator('.inbox-shortcut').click()
  const inbox = page.getByRole('region', { name: '收集箱文件' })
  await inbox.getByText('收集箱还是空的', { exact: true }).waitFor()
  assert.equal(await fs.stat(path.join(root, 'Inbox')).then(() => true, () => false), false)
  assert.equal(await inbox.getByRole('alert').count(), 0)
  await inbox.getByRole('button', { name: '新建第一条笔记', exact: true }).click()
  await inbox.getByRole('button', { name: /未命名.md/ }).waitFor()
  await page.waitForFunction(() => document.querySelector('.vditor-wysiwyg [contenteditable="true"]'))
  const files = await fs.readdir(path.join(root, 'Inbox'))
  assert.equal(files.filter(name => name.endsWith('.md')).length, 1)
  assert.equal(await fs.readFile(path.join(root, 'Inbox', '未命名.md'), 'utf8'), '')
  assert.deepEqual((await fs.readdir(root)).filter(name => name.endsWith('.md')), ['Note.md'])
  checks.push('Real native IPC: browsing a new inbox does not report an error or create a folder; new note creates exactly one Markdown file inside Inbox and opens its editor')

  const editor = page.locator('.vditor-wysiwyg [contenteditable="true"]').first()
  await editor.click(); await page.keyboard.type('native inbox draft')
  await page.waitForFunction(async () => (await import('/src/store/app.ts')).useAppStore().tabs.some(tab => tab.content?.includes('native inbox draft')))
  await fs.rename(path.join(root, 'Inbox'), path.join(root, 'Inbox-away'))
  await inbox.getByRole('button', { name: '刷新', exact: true }).click()
  await inbox.getByText('这个文件夹暂时打不开', { exact: true }).waitFor()
  assert.equal(await page.locator('#crash-screen').count(), 0)
  assert.equal(await fs.stat(path.join(root, 'Inbox')).then(() => true, () => false), false)
  assert.equal(await editor.textContent().then(text => text.includes('native inbox draft')), true)
  await page.screenshot({ path: output + '/missing-folder-keeps-draft.png' })
  await fs.rename(path.join(root, 'Inbox-away'), path.join(root, 'Inbox'))
  await inbox.getByRole('button', { name: '重试读取', exact: true }).click()
  await inbox.getByRole('button', { name: /未命名.md/ }).waitFor()
  assert.equal(await editor.textContent().then(text => text.includes('native inbox draft')), true)
  checks.push('Moving an existing Inbox yields local recovery, does not recreate it on read or replace the editor draft, and retries successfully when the folder returns')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: output + '/native-inbox.png' })
  await fs.writeFile(output + '/results.json', JSON.stringify({ checks, errors, scope: 'Built debug Tauri, actual native IPC and disk in an isolated temporary library; hidden WebView driven through CDP.' }, null, 2))
  console.log(JSON.stringify({ checks, errors }, null, 2))
} finally { await browser.close() }
