import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { waitForInstalledIndex } from './installed-index-readiness.mjs'

// Real packaged IPC, synthetic files and UI input; never grant test-only permissions.
export async function runInstalledV115Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || appVersion !== '1.1.5') throw Error('Disposable 1.1.5 installation required')
  if (path.resolve(library).toLowerCase() !== 'c:\\longeditr5ilibrary') throw Error('Only the disposable installer fixture library may be changed')
  const harnessSourceCommit = process.env.GITHUB_SHA || process.env.LONGEDIT_INSTALLED_HARNESS_COMMIT || ''
  assert.match(harnessSourceCommit, /^[a-f0-9]{40}$/, 'record the exact installer verification harness revision')
  const report = { appVersion, sourceCommit, harnessSourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  report.commandTrace = []; report.indexPreparationBusyResponses = 0
  const invoke = async (command, args = {}) => {
    const step = { command, startedAt: new Date().toISOString() }; report.commandTrace.push(step)
    await fs.writeFile(path.join(output, 'installed-v115-progress.json'), JSON.stringify(report, null, 2) + '\n')
    const r = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(e){return {ok:false,error:String(e)}}})()`)
    step.completedAt = new Date().toISOString(); step.status = r.ok ? 'completed' : 'rejected'
    if (!r.ok) { step.reason = r.error; throw Error(r.error) }; return r.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const button = label => `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const mouse = async expression => {
    await waitFor(`!!(${expression})`, 'v115 control exists')
    await evaluate(`(${expression}).scrollIntoView({block:'nearest'})`)
    const point = `(()=>{const e=${expression};if(!e||e.disabled)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`
    await waitFor(point, 'v115 control clickable'); const p = await evaluate(point)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 })
  }
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers })
  }
  const fill = async (selector, text) => {
    await mouse(`document.querySelector(${JSON.stringify(selector)})`); await key('a', 'KeyA', 65, 2); await send('Input.insertText', { text })
  }
  const palette = '.command-palette-container'
  // The previous workflow may leave any supported Markdown editing mode. Use
  // the visible editable surface, rather than waiting on a hidden wysiwyg tree.
  const editor = `[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')`
  const input = `${palette} input[aria-label="搜索资料或命令"]`
  const open = async () => { await key('p', 'KeyP', 80, 2); await waitFor(`!!document.querySelector('${palette}')`, 'v115 command panel') }
  const query = async text => {
    await fill(input, text)
    await waitFor(`document.querySelector(${JSON.stringify(input)})?.value===${JSON.stringify(text)}&&!document.querySelector('${palette} .results-list[aria-busy="true"]')&&![...document.querySelectorAll('${palette} .palette-status')].some(e=>e.textContent.includes('正在查找'))`, 'v115 query settled')
  }
  const scopeAll = async () => { await mouse(`document.querySelector('${palette} .palette-scope')`); await mouse(`[...document.querySelectorAll('.n-base-select-option')].find(e=>e.textContent.trim()==='全部资料库')`) }
  const result = name => `[...document.querySelectorAll('${palette} .result-item')].find(e=>e.querySelector('.item-title')?.textContent.includes(${JSON.stringify(name)}))`
  const normalize = p => { const value = p.replaceAll('\\', '/'); return (value.startsWith('//?/') ? value.slice(4) : value).toLowerCase() }
  const contains = (results, file) => results.some(r => normalize(r.path) === normalize(file))
  const snap = async name => { await waitFor(`!document.querySelector('.n-message')&&!document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity)`, 'v115 natural motion completed'); await capture(name) }
  const reloadPersistedConfig = async () => {
    const previousOrigin = await evaluate('performance.timeOrigin')
    await send('Page.reload')
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        if (await evaluate(`performance.timeOrigin!==${previousOrigin}&&document.readyState==='complete'&&!!window.__TAURI_INTERNALS__?.invoke`)) return
      } catch (cause) {
        if (!/context|navigat/i.test(String(cause))) throw cause
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw Error('Packaged application did not reload its persisted configuration')
  }
  let config
  try {
    // Finish the previous synthetic workflow as a user would. Never clear dirty
    // flags or discard its restored draft merely to make cross-library tests pass.
    await navigate('#/library', '.library-mode', 'finish prior synthetic edits')
    for (let index = 0; index < 64; index++) {
      const dirtyLabel = await evaluate(`document.querySelector('.workspace-tab[aria-label*="有未保存的修改"]')?.getAttribute('aria-label')`)
      if (!dirtyLabel) break
      await mouse(`[...document.querySelectorAll('.workspace-tab')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(dirtyLabel)})`)
      await waitFor(`document.querySelector('.workspace-tab.active')?.getAttribute('aria-label')===${JSON.stringify(dirtyLabel)}`, 'prior dirty tab selected')
      await mouse(button('保存'))
      await waitFor(`!!document.querySelector('.workspace-tab.active')&&!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`, 'prior draft explicitly saved')
    }
    assert.equal(await evaluate(`document.querySelectorAll('.workspace-tab[aria-label*="有未保存的修改"]').length`), 0, 'prior synthetic drafts must be saved, not discarded')
    const base = path.join(path.dirname(library), 'release-v115-external'), second = path.join(path.dirname(library), 'release-v115-other-library')
    await fs.mkdir(base); await fs.mkdir(second)
    const imageBytes = await fs.readFile(new URL('../../src-tauri/icons/32x32.png', import.meta.url))
    const existingImageBytes = await fs.readFile(new URL('../../src-tauri/icons/128x128.png', import.meta.url))
    const source = path.join(base, '资料.md'), bad = path.join(base, '缺图.md'), txt = path.join(base, '附带.txt')
    const sourceText = '# 外部资料\n![图](image.png)\n\n<img title="a > b" data-hint=" src=\'not-an-image.png\'" src="image.png">\n'
    await fs.writeFile(source, sourceText, { flag: 'wx' }); await fs.writeFile(path.join(base, 'image.png'), imageBytes, { flag: 'wx' })
    await fs.writeFile(bad, '# 缺图\n![图](missing.png)\n', { flag: 'wx' }); await fs.writeFile(txt, '附带正文', { flag: 'wx' })
    await fs.writeFile(path.join(library, '资料.md'), '已有正文不可覆盖', { flag: 'wx' }); await fs.mkdir(path.join(library, '资料.assets')); await fs.writeFile(path.join(library, '资料.assets', 'image.png'), existingImageBytes, { flag: 'wx' })
    const batch = paths => invoke('import_library_files', { sourcePaths: paths, libraryRoot: library, targetDir: library })
    const denied = await batch([source])
    check('unauthorized-import-is-rejected-without-changing-library', denied.items.length === 0 && denied.errors.length === 1 && await fs.readFile(path.join(library, '资料.md'), 'utf8') === '已有正文不可覆盖')
    // The production external-open command authorizes the selected file. No access-state injection.
    for (const file of [source, bad, txt]) {
      const label = await invoke('open_external_file_window', { path: file })
      assert.match(label, /^external-\d+-\d+$/)
      await invoke('plugin:window|close', { label })
    }
    await invoke('plugin:window|set_focus', { label: await evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label') })
    check('external-window-commands-return-without-blocking-native-ipc', await invoke('plugin:app|version') === appVersion)
    const imported = await batch([source, bad, txt]), copy = imported.items.find(item => item.oldPath === source || normalize(item.oldPath) === normalize(source))
    assert.ok(copy)
    const content = await fs.readFile(copy.newPath, 'utf8'), image = content.match(/!\[图\]\(([^)]+)\)/)?.[1]
    check('same-name-document-and-local-images-never-overwrite-existing-content', path.basename(copy.newPath) === '资料 - 副本.md' && await fs.readFile(path.join(library, '资料.md'), 'utf8') === '已有正文不可覆盖' && (await fs.readFile(path.join(library, '资料.assets', 'image.png'))).equals(existingImageBytes) && !!image && (await fs.readFile(path.resolve(path.dirname(copy.newPath), decodeURIComponent(image)))).equals(imageBytes) && content.includes('title="a > b"') && content.includes(`src="${image}"`) && await fs.readFile(source, 'utf8') === sourceText)
    check('batch-import-reports-partial-failure-without-publishing-missing-image-note', imported.items.length === 2 && imported.errors.length === 1 && normalize(imported.errors[0].path) === normalize(bad) && !(await fs.readdir(library)).includes('缺图.md'))
    const before = (await fs.readdir(library)).sort(); await fs.writeFile(path.join(base, 'missing.png'), imageBytes, { flag: 'wx' })
    const retried = await batch(imported.errors.map(error => error.path)), after = await fs.readdir(library)
    check('retrying-only-failed-source-retains-completed-file-identities', retried.items.length === 1 && retried.errors.length === 0 && before.every(name => after.includes(name)) && after.filter(name => name.startsWith('资料 - 副本')).length === 1 && after.filter(name => name.startsWith('附带')).length === 1)

    const main = path.join(library, 'v115-预算资料.txt'), data = path.join(library, 'v115-预算配置.json'), old = path.join(library, 'v115-旧版预算.txt'), remote = path.join(second, 'v115-另库预算.txt'), draft = path.join(library, 'v115-草稿.md')
    await fs.writeFile(main, '项目批准\n预算已确认\n', { flag: 'wx' }); await fs.writeFile(data, '{"项目":"预算已确认"}', { flag: 'wx' }); await fs.writeFile(old, '项目预算旧版', { flag: 'wx' }); await fs.writeFile(remote, '项目预算另库资料', { flag: 'wx' }); await fs.writeFile(draft, '# 安装态草稿\n\n尚未修改\n', { flag: 'wx' })
    config = await invoke('get_config')
    await invoke('save_config', { config: { ...config, libraries: [...config.libraries, { id: 'v115-release-other', name: '另一个资料库', path: second }], activeLibraryPath: library } })
    // Native save_config writes disk but does not mutate an already mounted Pinia
    // store. Reload normally to represent the next launch with two saved libraries.
    await reloadPersistedConfig()
    for (const root of [library, second]) {
      const prepared = await waitForInstalledIndex(() => invoke('rebuild_knowledge_index', { libraryRoot: root }), { onBusy: () => { report.indexPreparationBusyResponses++ } })
      assert.equal(prepared.state, 'ready', 'real native index must be ready before indexed-search assertions')
    }
    const expression = '项目 预算 -旧版', local = await invoke('search_knowledge_libraries', { libraryRoot: library, query: expression }), all = await invoke('search_knowledge_libraries', { libraryRoot: null, query: expression }), legacy = await invoke('search_knowledge', { libraryRoot: library, query: expression })
    check('shared-native-search-matches-txt-json-and-configured-library-scope', contains(local.results, main) && contains(local.results, data) && !contains(local.results, old) && !contains(local.results, remote) && contains(all.results, remote) && contains(legacy, main) && contains(legacy, data))
    await navigate('#/library?path=' + encodeURIComponent(draft), '.library-mode', 'v115 actual command panel')
    await waitFor(`(${editor})?.textContent.includes('安装态草稿')`, 'v115 draft ready')
    await open(); await query(expression); await waitFor(`!!(${result('v115-预算资料')})&&!!(${result('v115-预算配置')})`, 'v115 TXT and JSON results')
    await scopeAll(); await waitFor(`!!(${result('v115-另库预算')})`, 'v115 all-library result visible')
    check('palette-scope-dropdown-is-clickable-and-shows-real-native-results', await evaluate(`!!(${result('v115-预算资料')})&&!!(${result('v115-预算配置')})&&!!(${result('v115-另库预算')})`))
    await snap('installed-v115-search.jpg')
    await query('"未结束'); await waitFor(`document.querySelector('${palette} [role="alert"]')?.textContent.includes('缺少结束双引号')`, 'invalid phrase feedback')
    const invalidDistinct = await evaluate(`!document.querySelector('${palette} .no-results')`)
    await query('v115-不存在-410974'); await waitFor(`!!document.querySelector('${palette} .no-results')`, 'genuine empty result')
    check('invalid-query-and-genuine-empty-state-are-distinct', invalidDistinct && !await evaluate(`!!document.querySelector('${palette} [role="alert"]')`))
    await query(expression); await waitFor(`!!(${result('v115-预算资料')})`, 'v115 main text result'); await mouse(result('v115-预算资料'))
    await waitFor(`!document.querySelector('${palette}')&&document.querySelector('.library-embedded-editor .cm-content')?.textContent.includes('预算已确认')`, 'v115 result opened in main editor')
    check('search-result-opens-in-main-editor-without-replacing-reference', await evaluate(`!!document.querySelector('.library-embedded-editor .text-workspace')&&!document.querySelector('.reference-workspace .text-workspace')`))
    await navigate('#/library?path=' + encodeURIComponent(draft), '.library-mode', 'v115 draft protection')
    await waitFor(`(${editor})?.textContent.includes('安装态草稿')`, 'draft loaded again')
    report.markdownInputMode = await evaluate(`(${editor}).closest('.vditor-wysiwyg,.vditor-ir,.vditor-sv')?.className`)
    await mouse(editor); await key('a', 'KeyA', 65, 2); await send('Input.insertText', { text: '用户刚输入的未保存预算草稿' })
    await open(); await scopeAll(); await query(expression); await waitFor(`!!(${result('v115-另库预算')})`, 'cross-library result ready'); await mouse(result('v115-另库预算'))
    await waitFor(`document.querySelector('${palette} [role="alert"]')?.textContent.includes('未保存')`, 'unsaved draft blocks library switch')
    const protectedDraft = await fs.readFile(draft, 'utf8') === '# 安装态草稿\n\n尚未修改\n' && normalize((await invoke('get_config')).activeLibraryPath) === normalize(library)
    await key('Escape', 'Escape', 27); await waitFor(`!document.querySelector('${palette}')`, 'palette closed'); await mouse(button('保存'))
    await waitFor(`(async()=>{const r=await window.__TAURI_INTERNALS__.invoke('read_text_document',{libraryRoot:${JSON.stringify(library)},path:${JSON.stringify(draft)},formatId:'markdown'});return r.content.includes('用户刚输入')})()`, 'user explicitly saved draft')
    await open(); await query(expression); await waitFor(`!!(${result('v115-另库预算')})`, 'other library ready after save'); await mouse(result('v115-另库预算'))
    await waitFor(`!document.querySelector('${palette}')&&document.querySelector('.library-embedded-editor .cm-content')?.textContent.includes('另库资料')`, 'saved draft permits switch')
    check('actual-typing-blocks-cross-library-open-until-explicit-save', protectedDraft && (await fs.readFile(draft, 'utf8')).includes('用户刚输入') && normalize((await invoke('get_config')).activeLibraryPath) === normalize(second))
    await snap('installed-v115-main.jpg')
    check('v115-workflows-have-no-global-error-overlay', !await evaluate(`!!document.querySelector('#crash-screen,#runtime-error-notice,.route-error-fallback')`))
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = String(error); await capture('installed-v115-failure.jpg').catch(() => {}); throw error }
  finally {
    let cleanupError
    if (config) {
      try { await invoke('save_config', { config }); await evaluate("location.hash='#/library'"); await reloadPersistedConfig() }
      catch (cause) { cleanupError = cause; report.cleanupError = String(cause) }
    }
    const passedBeforeCleanup = report.status === 'passed'
    if (cleanupError) report.status = 'failed'
    await fs.writeFile(path.join(output, 'installed-v115-workflow.json'), JSON.stringify(report, null, 2) + '\n')
    if (cleanupError && passedBeforeCleanup) throw cleanupError
  }
}
