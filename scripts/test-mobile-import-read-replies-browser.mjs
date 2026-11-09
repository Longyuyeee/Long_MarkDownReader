import { readTextImportPreview } from './mobile-text-import-navigation.mjs'
// Production component with deferred test storage; this does not exercise Android IPC or SAF.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
const require = createRequire(import.meta.url), { chromium } = require(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright'), { parse, compileScript, compileStyle } = require('@vue/compiler-sfc'), esbuild = require('esbuild')
const output = `docs/evidence/mobile-0.1.0/import-read-replies-${Date.now()}`
await mkdir(output, { recursive: true }); await writeFile(output + '/.gitignore', '*\n')
const report = { scope: 'Production FileImportPanel.vue compiled with deferred injected storage replies. No Android IPC, system picker, SAF, lifecycle or native Back validation.', nativeAndroidTest: false, checks: [], errors: [], componentSha256: createHash('sha256').update(await readFile('src/mobile/FileImportPanel.vue')).digest('hex') }
const source = `
import {createApp,h,ref} from 'vue'; import FileImportPanel from './src/mobile/FileImportPanel.vue';
const entry={id:'same-id',name:'保留的文字.md',created:1793152800000,bytes:12,status:'ready',readable:true,content:'完整文字😀',digest:'fixture',error:'',localPath:null};
window.__entry=entry;window.__calls=[];const busy=ref(false),component=ref();window.__busy=()=>busy.value;window.__back=()=>component.value.back();
const storage={preview:false,fileImports(){window.__calls.push('list');return new Promise((resolve,reject)=>{window.__list=()=>resolve({entries:[entry],truncated:false});window.__listError=()=>reject(Error('暂时无法读取记录'))})},fileImport(id){window.__calls.push(id);return new Promise((resolve,reject)=>{window.__record=()=>resolve({...entry});window.__recordError=()=>reject(Error('暂时无法读取文字'))})},chooseTextImport(){window.__calls.push('choose');return new Promise(resolve=>{window.__cancel=()=>resolve(null)})}};
createApp({setup(){return()=>h('div',{class:'mobile-app'},h('section',{class:'bottom-sheet',role:'dialog','aria-label':'文件导入'},h(FileImportPanel,{ref:component,storage,initialId:new URL(location.href).searchParams.has('source')?'same-id':undefined,sourceTask:new URL(location.href).searchParams.has('source'),openDocument:()=>{throw Error('Unexpected document admission')},onBusy:v=>busy.value=v})))}}).mount('#app');`
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'vue-source', setup(build) { build.onLoad({ filter: /\.vue$/ }, async args => { const text = await readFile(args.path, 'utf8'), { descriptor } = parse(text, { filename: args.path }), id = createHash('sha256').update(args.path).digest('hex').slice(0, 8), compiled = compileScript(descriptor, { id, inlineTemplate: true }), styles = descriptor.styles.map(s => compileStyle({ source: s.content, filename: args.path, id: 'data-v-' + id, scoped: s.scoped }).code).join('\n'); return { contents: compiled.content.replace('export default', 'const __component =') + `;__component.__scopeId='data-v-${id}';const s=document.createElement('style');s.textContent=${JSON.stringify(styles)};document.head.append(s);export default __component;`, loader: 'ts', resolveDir: path.dirname(args.path) } }) } }] })
const css = /href="([^"]+\.css)"/.exec(await readFile('dist/mobile.html', 'utf8'))[1].replace(/^\.\//, '/')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), button = name => page.getByRole('button', { name, exact: true })
  page.on('pageerror', e => report.errors.push(String(e)))
  await page.route('**/__import_read_reply.html*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="${css}"><div id="app"></div><script src="/__import_read_reply.js"></script></html>` }))
  await page.route('**/__import_read_reply.js', route => route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }))
  await page.goto('http://127.0.0.1:9012/__import_read_reply.html')
  await page.waitForFunction(() => window.__busy())
  assert.deepEqual(await page.evaluate(() => [__back(), __back(), __calls.length]), [true, true, 1]); assert.equal(await button('选择文件').isDisabled(), true); assert.equal(await button('连接原文件夹').isDisabled(), true)
  await page.evaluate(() => __listError()); await button('重新读取记录').waitFor(); assert.equal(await page.getByText('暂无导入记录。', { exact: true }).count(), 0)
  await button('重新读取记录').click(); assert.equal(await button('刷新记录').isDisabled(), true); assert.equal(await page.evaluate(() => __back()), true)
  await page.evaluate(() => __list()); await page.locator('[data-file-import-id="same-id"]').click()
  assert.equal(await page.evaluate(() => __back()), true); await page.evaluate(() => __recordError()); await button('重新读取这条记录').click()
  assert.equal(await button('重新读取这条记录').isDisabled(), true); assert.equal(await page.evaluate(() => __back()), true); await page.evaluate(() => __record())
  await button('存入手机资料库并打开').waitFor(); assert.equal(await readTextImportPreview(page, () => page.evaluate(() => __back())), '完整文字😀')
  assert.deepEqual(await page.evaluate(() => __calls), ['list', 'list', 'same-id', 'same-id'])
  report.checks.push('Deferred list and record reads block duplicate actions and consume Back; failures retain a reachable retry, with the same record ID and no implicit commit')
  assert.equal(await page.evaluate(() => __back()), true); await page.evaluate(() => __list()); await button('选择文件').click()
  assert.equal(await button('选择文件').isDisabled(), true); assert.equal(await page.evaluate(() => __back()), true); await page.evaluate(() => __cancel()); await page.waitForFunction(() => __calls.at(-1) === 'list'); await page.evaluate(() => __list()); await page.locator('[data-file-import-id="same-id"]').waitFor()
  assert.equal(await page.getByRole('heading', { name: '保留的文字.md', exact: true }).count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0); report.checks.push('Injected native-branch picker cancellation returns to the existing history after its refresh; it does not create or open a new record')
  await page.goto('http://127.0.0.1:9012/__import_read_reply.html?source=1'); await page.waitForFunction(() => __busy()); await page.evaluate(() => __listError())
  await page.getByRole('alert').filter({ hasText: '导入记录未能读取。' }).waitFor(); assert.equal(await page.getByText('这条接收记录已不可用，请返回收到的内容。', { exact: true }).count(), 0)
  await button('重新读取收到的文字').click(); await page.evaluate(() => __list()); await page.waitForFunction(() => __calls.at(-1) === 'same-id'); await page.evaluate(() => __recordError())
  await button('重新读取这条记录').click(); await page.evaluate(() => __record()); await button('存入手机资料库并打开').waitFor()
  assert.equal(await page.getByRole('alert').count(), 0); report.checks.push('Received-text list failure is not misreported as a missing receipt; its retry and record retry recover the same initial ID')
  assert.deepEqual(report.errors, []); report.passed = true
} catch (e) { report.failure = String(e.stack || e); process.exitCode = 1 }
finally { await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, failure: report.failure }, null, 2)) }
