import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { waitForInstalledIndex } from './installed-index-readiness.mjs'
import { searchFeedbackContract, paletteFileOpenExpression } from './search-feedback-contract.mjs'

// Real packaged IPC, synthetic files and UI input; never grant test-only permissions.
export async function runInstalledV115Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13', '1.3.14'].includes(appVersion)) throw Error('Disposable 1.1.5 or later supported installation required')
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
  const selectScope = async label => { await mouse(`document.querySelector('${palette} .palette-scope')`); await mouse(`[...document.querySelectorAll('.n-base-select-option')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`) }
  const scopeAll = () => selectScope('全部资料库')
  const result = name => paletteFileOpenExpression(name, palette)
  // Paged searches preserve the visible order until the user accepts a new
  // snapshot. Follow that visible action when more libraries complete.
  const resultReady = async (name, label) => {
    const names = Array.isArray(name) ? name : [name]
    const ready = names.map(file => `!!(${result(file)})`).join('&&')
    const refresh = `document.querySelector('${palette} .search-page-update button:not([disabled])')`
    for (let step = 0; step < 8; step++) {
      await waitFor(`(${ready})||!!(${refresh})`, label+' or explicit refresh')
      if (await evaluate(ready)) return
      await mouse(refresh)
    }
    throw Error('Expected search files absent after explicit refresh: '+names.join(', '))
  }

  const normalize = p => { const value = p.replaceAll('\\', '/'); return (value.startsWith('//?/') ? value.slice(4) : value).toLowerCase() }
  const visibleSaveState = `(()=>{const s=document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('app');return {state:document.querySelector('.document-save-state')?.textContent.trim(),tabs:[...document.querySelectorAll('.workspace-tab')].map(e=>e.getAttribute('aria-label')),error:document.querySelector('${palette} [role="alert"]')?.textContent,dirtyModels:s?.tabs.filter(t=>t.isDirty).map(t=>({path:t.path,content:t.content?.slice(0,300)})),tempDirty:s?.isTempDirty}})()`
  const contains = (results, file) => results.some(r => normalize(r.path) === normalize(file))
  const navigationState = `(()=>{const app=document.querySelector('#app')?.__vue_app__,s=app?.config.globalProperties.$pinia?._s.get('app'),components=[],seen=new Set();const visit=v=>{if(!v||typeof v!=='object'||seen.has(v)||seen.size>6000)return;seen.add(v);const c=v.component,n=c?.type?.__name||c?.type?.name;if(c&&n==='LibraryMode'){const t=c.setupState?.treeData;components.push({name:n,uid:c.uid,unmounted:c.isUnmounted,treeKeys:Array.isArray(t)?t.map(x=>x.key):undefined,loading:c.setupState?.libraryLoading,error:c.setupState?.libraryLoadError})}if(c&&n==='Tree'&&Array.isArray(c.props?.data))components.push({name:n,uid:c.uid,dataKeys:c.props.data.map(x=>x.key)});if(c)visit(c.subTree);if(Array.isArray(v.children))v.children.forEach(visit);if(v.suspense)visit(v.suspense.activeBranch)};visit(document.querySelector('#app')?._vnode);return {hash:location.hash,visibility:document.visibilityState,focused:document.hasFocus(),root:s?.libraryPath,tabs:s?.tabs.map(t=>({id:t.id,path:t.path})),components,visibleTreePaths:[...document.querySelectorAll('[data-drop-path]')].filter(e=>e.getClientRects().length).map(e=>e.getAttribute('data-drop-path')),scanTrace:window.__longeditV115ScanTrace,consoleErrors:window.__longeditV115Errors}})()`
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
    await open(); await query(expression); await waitFor(`!!(${result(path.basename(main))})&&!!(${result(path.basename(data))})`, 'v115 TXT and JSON results')
    // A small library may finish first. Its one visible result is not evidence
    // that the larger library has completed its page; accept the normal update
    // action until all three expected files are visible in the same snapshot.
    await scopeAll(); await resultReady([main, data, remote].map(file => path.basename(file)), 'v115 all-library results visible')
    check('palette-scope-dropdown-is-clickable-and-shows-real-native-results', await evaluate(`!!(${result(path.basename(main))})&&!!(${result(path.basename(data))})&&!!(${result(path.basename(remote))})`))
    await snap('installed-v115-search.jpg')
    // This shared fixture retains earlier format/failure examples. The paged
    // product must not label its incomplete scan as a genuine empty result.
    // Open the existing one-TXT library normally and select current-library
    // scope for the complete-zero task; never delete the difficult examples.
    await mouse(result(path.basename(remote)))
    await waitFor(`!document.querySelector('${palette}')&&document.querySelector('.library-embedded-editor .cm-content')?.textContent.includes('另库资料')`, 'healthy library opened through its real result')
    await open(); await selectScope('当前资料库'); await query(expression)
    await waitFor(`!!(${result(path.basename(remote))})`, 'healthy current-library search result')
    report.emptyResultScope = { activeLibrary: (await invoke('get_config')).activeLibraryPath, expectedLibrary: second, selection: '当前资料库' }
    assert.equal(normalize(report.emptyResultScope.activeLibrary), normalize(second), 'genuine-zero probe is scoped to the existing readable TXT library')
    // Observe the valid result view, not transient syntax-error/loading chrome.
    const feedback=searchFeedbackContract(await evaluate(`!!document.querySelector('${palette} .search-page-status')`),palette)
    await query('"未结束'); await waitFor(`document.querySelector('${palette} [role="alert"]')?.textContent.includes('缺少结束双引号')`, 'invalid phrase feedback')
    const invalidDistinct = !await evaluate(feedback.emptyExpression)
    await query('v115-不存在-410974'); await waitFor(feedback.emptyExpression, 'genuine empty result')
    check('invalid-query-and-genuine-empty-state-are-distinct', invalidDistinct && !await evaluate(`!!document.querySelector('${palette} [role="alert"]')`))
    await snap('installed-v115-genuine-empty.jpg')
    await scopeAll(); await query(expression); await resultReady(path.basename(main), 'v115 main text result'); await mouse(result(path.basename(main)))
    await waitFor(`!document.querySelector('${palette}')&&document.querySelector('.library-embedded-editor .cm-content')?.textContent.includes('预算已确认')`, 'v115 result opened in main editor')
    check('search-result-opens-in-main-editor-without-replacing-reference', await evaluate(`!!document.querySelector('.library-embedded-editor .text-workspace')&&!document.querySelector('.reference-workspace .text-workspace')`))
    await navigate('#/library?path=' + encodeURIComponent(draft), '.library-mode', 'v115 draft protection')
    await waitFor(`(${editor})?.textContent.includes('安装态草稿')`, 'draft loaded again')
    report.markdownInputMode = await evaluate(`(${editor}).closest('.vditor-wysiwyg,.vditor-ir,.vditor-sv')?.className`)
    await mouse(editor); await key('a', 'KeyA', 65, 2); await send('Input.insertText', { text: '用户刚输入的未保存预算草稿' })
    await open(); await scopeAll(); await query(expression); await resultReady(path.basename(remote), 'cross-library result ready'); await mouse(result(path.basename(remote)))
    await waitFor(`document.querySelector('${palette} [role="alert"]')?.textContent.includes('未保存')`, 'unsaved draft blocks library switch')
    const protectedDraft = await fs.readFile(draft, 'utf8') === '# 安装态草稿\n\n尚未修改\n' && normalize((await invoke('get_config')).activeLibraryPath) === normalize(library)
    await key('Escape', 'Escape', 27); await waitFor(`!document.querySelector('${palette}')`, 'palette closed'); await mouse(button('保存'))
    // Wait for the user-visible receipt before issuing another native read:
    // the in-flight write intentionally owns the document until it completes.
    await waitFor(`document.querySelector('.document-save-state')?.textContent.trim()==='已保存'&&!document.querySelector('.workspace-tab.active[aria-label*="有未保存的修改"]')`, 'explicit save completed in the user interface')
    report.afterExplicitSave = await evaluate(visibleSaveState)
    const savedDraft = await invoke('read_text_document', { libraryRoot: library, path: draft, formatId: 'markdown' })
    assert.ok(savedDraft.content.includes('用户刚输入'), 'explicitly saved draft exists on disk after its receipt')
    report.afterDiskWrite = await evaluate(visibleSaveState)
    await open(); await query(expression); await waitFor(`!!(${result(path.basename(remote))})`, 'other library ready after save'); await mouse(result(path.basename(remote)))
    await waitFor(`!document.querySelector('${palette}')&&document.querySelector('.library-embedded-editor .cm-content')?.textContent.includes('另库资料')`, 'saved draft permits switch')
    report.switchedDirectory = await invoke('scan_directory', { libraryRoot: second, path: second })
    report.navigationBeforeTreeWait = await evaluate(navigationState)
    await waitFor(`[...document.querySelectorAll('[data-drop-path]')].some(e=>e.getClientRects().length&&e.getAttribute('data-drop-path').replaceAll('\\\\','/').endsWith('/'+${JSON.stringify(path.basename(remote))}))`, 'switched library file tree is visible without manual refresh')
    check('actual-typing-blocks-cross-library-open-until-explicit-save', protectedDraft && (await fs.readFile(draft, 'utf8')).includes('用户刚输入') && normalize((await invoke('get_config')).activeLibraryPath) === normalize(second))
    await snap('installed-v115-main.jpg')
    check('v115-workflows-have-no-global-error-overlay', !await evaluate(`!!document.querySelector('#crash-screen,#runtime-error-notice,.route-error-fallback')`))
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = String(error); report.failureUiState = await evaluate(visibleSaveState).catch(() => null); report.failureNavigation = await evaluate(navigationState).catch(() => null); await capture('installed-v115-failure.jpg').catch(() => {}); throw error }
  finally {
    let cleanupError
    if (config) {
      try {
        await invoke('save_config', { config })
        // A failed user task may intentionally retain a draft. Do not reload
        // through its native unsaved-changes dialog or discard it for cleanup.
        if (report.status === 'passed') { await evaluate("location.hash='#/library'"); await reloadPersistedConfig() }
        else report.cleanupUiReload = 'not-attempted-after-failed-user-workflow'
      }
      catch (cause) { cleanupError = cause; report.cleanupError = String(cause) }
    }
    const passedBeforeCleanup = report.status === 'passed'
    if (cleanupError) report.status = 'failed'
    await fs.writeFile(path.join(output, 'installed-v115-workflow.json'), JSON.stringify(report, null, 2) + '\n')
    if (cleanupError && passedBeforeCleanup) throw cleanupError
  }
}
