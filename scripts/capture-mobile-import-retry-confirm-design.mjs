// Freeze the additional removal warning before changing its production copy.
import { readFile, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const root = 'docs/evidence/mobile-import-read-retry-2026-10-28', design = 'docs/design/mobile-import-read-retry-v2'
try { await access(root + '/confirmation-freeze.json'); throw Error('Confirmation already frozen') } catch (e) { if (e.code !== 'ENOENT') throw e }
const warning = '记录内容暂时无法读取。移除后，其中可能尚未存入笔记的文字也会移除。源文件和已存入的笔记不会删除。'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 872 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    if (window !== window.top) return
    const key = 'longedit-mobile-preview-v1', entry = { id: 'read-failure', name: '行程核对.md', created: 1793152800000, bytes: 3, content: 'abc', digest: 'fixture', readable: true, status: 'ready', error: '', localPath: null }
    localStorage.setItem(key, JSON.stringify({ version: 1, documents: {}, drafts: {}, fileImports: { [entry.id]: entry } }))
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (k) { if (k === key && /\.fileImport\s*\(/.test(new Error().stack || '')) throw Error('读取暂时失败，请稍后重试。'); return get.call(this, k) }
  })
  await page.goto('http://127.0.0.1:9012/mobile.html'); await page.getByRole('button', { name: '添加资料', exact: true }).tap(); await page.getByRole('button', { name: '导入文本文件', exact: true }).tap(); await page.locator('[data-file-import-id="read-failure"]').tap(); await page.getByRole('button', { name: '重新读取这条记录', exact: true }).waitFor(); await page.getByRole('button', { name: '移除此条导入记录', exact: true }).tap(); await page.getByRole('alertdialog').waitFor()
  await page.screenshot({ path: root + '/before-read-failure-confirm.png' })
  await page.locator('[aria-label="确认移除导入记录"] p').evaluate((e, warning) => { e.textContent = warning }, warning)
  const html = await page.evaluate(() => { const root = document.documentElement.cloneNode(true); root.querySelectorAll('script,link[rel=modulepreload]').forEach(e => e.remove()); root.querySelectorAll('link[rel=stylesheet]').forEach(e => e.setAttribute('href', 'confirmation.css')); return '<!doctype html>' + root.outerHTML })
  await writeFile(design + '/read-failure-confirm.html', html)
  const css = await page.locator('link[rel=stylesheet]').first().getAttribute('href'); await writeFile(design + '/confirmation.css', await (await page.request.get(new URL(css, page.url()).href)).body())
  await page.screenshot({ path: root + '/design-v2-read-failure-confirm.png' })
  const files = {}; for (const file of [design + '/read-failure-confirm.html', design + '/confirmation.css', root + '/design-v2-read-failure-confirm.png', root + '/before-read-failure-confirm.png']) files[file] = createHash('sha256').update(await readFile(file)).digest('hex')
  await writeFile(root + '/confirmation-freeze.json', JSON.stringify({ frozenAt: new Date().toISOString(), sourceSha256: createHash('sha256').update(await readFile('src/mobile/FileImportPanel.vue')).digest('hex'), warning, files, reason: 'A failed receipt read cannot establish whether its complete pending text has been saved. Warn before removal; cancellation must preserve the same receipt.' }, null, 2))
  console.log('Frozen confirmation warning and original screenshot')
} finally { await browser.close() }
