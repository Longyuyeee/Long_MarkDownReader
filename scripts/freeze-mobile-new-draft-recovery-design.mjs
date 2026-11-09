import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { compileMobileVuePrototype } from './compile-mobile-vue-prototype.mjs'
const folder = 'docs/design/mobile-new-draft-recovery-v1'
const output = 'docs/evidence/mobile-0.1.0/redesign-native-2026-10-29/design'
await mkdir(output, { recursive: true })
await assert.rejects(readFile(output + '/freeze.json'), { code: 'ENOENT' })
// A new checkout must not overwrite the committed reference just because the
// original raw output folder is ignored. Use a new version for a new design.
for (const name of ['baseline.css', 'runtime.js', 'index.html']) await assert.rejects(readFile(folder + '/' + name), { code: 'ENOENT' })
const css = 'dist/assets/mobile-CHPzoowG.css'
await copyFile(css, folder + '/baseline.css')
await writeFile(folder + '/runtime.js', await compileMobileVuePrototype(`import {createApp} from 'vue';import Reference from './${folder}/Reference.vue';createApp(Reference).mount('#app')`))
await writeFile(folder + '/index.html', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./baseline.css"><div id="app"></div><script src="./runtime.js"></script></html>')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const freeze = { frozenAt: new Date().toISOString(), productionUnchanged: true, baselineCss: css, files: {}, screens: [] }
for (const name of ['Reference.vue', 'baseline.css', 'runtime.js', 'index.html']) freeze.files[name] = sha(await readFile(folder + '/' + name))
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const state of [
    { name: 'new', width: 393, height: 751, query: '' },
    { name: 'saved', width: 393, height: 751, query: 'state=saved' },
    { name: 'new-short-large', width: 320, height: 346, query: 'large' },
    { name: 'new-dark', width: 393, height: 751, query: 'dark' }
  ]) {
    const page = await browser.newPage({ viewport: { width: state.width, height: state.height } })
    await page.goto('http://127.0.0.1:9026/design/mobile-new-draft-recovery-v1/index.html?' + state.query)
    await page.getByRole('region', { name: '发现恢复草稿' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '先阅读文件', exact: true }).count(), state.name === 'saved' ? 1 : 0)
    assert.equal(await page.locator('.editor-footer').count(), 0)
    await page.getByRole('button', { name: '继续这份草稿', exact: true }).scrollIntoViewIfNeeded()
    const file = output + '/' + state.name + '.png'
    await page.screenshot({ path: file })
    freeze.screens.push({ ...state, file, sha256: sha(await readFile(file)) })
    await page.close()
  }
} finally { await browser.close() }
await writeFile(output + '/freeze.json', JSON.stringify(freeze, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ frozenScreens: freeze.screens.length, productionUnchanged: true }))
