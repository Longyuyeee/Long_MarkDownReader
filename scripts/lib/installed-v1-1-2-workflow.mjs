import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { nativeUserInput } from './v118-native-user-input.mjs'

// Packaged UI, native IPC and a synthetic library on the disposable runner.
export async function runInstalledV112Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13'].includes(appVersion)) throw Error('Disposable compatible installation required')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args = {}) => {
    const result = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error:String(error)}}})()`)
    if (!result.ok) throw Error(result.error)
    return result.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const captureSettled = async name => {
    await waitFor(`!document.querySelector('.n-message') && !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)`, 'natural dialog animation and transient feedback completion')
    await capture(name)
  }
  const exists = file => fs.stat(file).then(() => true, () => false)
  const ui = nativeUserInput({ send, evaluate })
  const mouse = (expression, button = 'left') => ui.clickTarget(expression, button)
  const item = label => `[...document.querySelectorAll('.n-dropdown-option-body')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const button = (label, root = 'document') => `[...(${root}?.querySelectorAll('button') || [])].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const row = name => `[...document.querySelectorAll('[data-drop-path]')].find(e=>e.dataset.dropPath.replaceAll('\\\\','/').endsWith(${JSON.stringify(name.replaceAll('\\', '/'))}))`
  const menu = async (name, label) => { await mouse(row(name), 'right'); await mouse(item(label)) }
  const more = async (name, label) => {
    await mouse(row(name), 'right')
    await waitFor(`!!(${item('更多操作')})`, 'more file operations menu item')
    await ui.hoverTarget(item('更多操作'))
    await mouse(item(label))
  }
  const sourceName = 'release-v112-note.md', duplicateName = 'release-v112-note - 副本.md'
  const source = path.join(library, sourceName), duplicate = path.join(library, duplicateName)
  const content = '# Installed file management\n\nOriginal source remains readable.\n'
  try {
    await fs.writeFile(source, content, { flag: 'wx' })
    await navigate('#/library?path=' + encodeURIComponent(source), '.library-mode', 'installed file management')
    // Earlier work-session/search checks intentionally preserve their filters.
    // Enter file management as a user would, without resetting product state or
    // mistaking the search-results panel for a missing filesystem entry.
    const navigationInput = '.search-control-row input'
    report.fileNavigationSetup = { searchBefore: await evaluate(`document.querySelector(${JSON.stringify(navigationInput)})?.value`), method: 'native-webview-keyboard' }
    await ui.fill(navigationInput, '')
    await ui.waitFor(`document.querySelector(${JSON.stringify(navigationInput)})?.value===''`, 'explicitly clear inherited search before native file operations')
    report.fileNavigationSetup.searchAfter = await evaluate(`document.querySelector(${JSON.stringify(navigationInput)}).value`)
    await mouse(`document.querySelector('#tab-files')`)
    // The shared tooltip service promotes native titles to accessible labels.
    await mouse(`document.querySelector('#panel-files button[aria-label="刷新列表"], #panel-files button[data-app-tooltip="刷新列表"], #panel-files button[title="刷新列表"]')`)
    await waitFor(`!!(${row(sourceName)})`, 'new file in native tree')
    await menu(sourceName, '创建副本')
    await waitFor(`!!(${row(duplicateName)})`, 'duplicate revealed in native tree')
    check('context-duplicate-writes-real-copy-and-preserves-source', await fs.readFile(duplicate, 'utf8') === content && await fs.readFile(source, 'utf8') === content)
    await captureSettled('installed-v112-context-result.jpg')

    await menu(sourceName, '移动到…')
    const input = `document.querySelector('.file-operation-dialog input[aria-label="目标文件夹"]')`
    await mouse(input)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.insertText', { text: 'release-v112-target/nested' })
    await captureSettled('installed-v112-move-dialog.jpg')
    await mouse(button('移动', `document.querySelector('.file-operation-dialog')`))
    const moved = path.join(library, 'release-v112-target', 'nested', sourceName)
    await waitFor(`!document.querySelector('.file-operation-dialog') && !!(${row('nested\\' + sourceName)})`, 'nested native move completed')
    check('move-dialog-creates-directory-and-updates-active-path', await fs.readFile(moved, 'utf8') === content && !await exists(source) && (await evaluate('decodeURIComponent(location.hash)')).replaceAll('\\', '/').includes('nested/' + sourceName))
    await more(sourceName, '撤销上次移动')
    await waitFor(`!!(${row(sourceName)}) && !(${row('nested\\' + sourceName)})`, 'native undo revealed original path')
    check('context-undo-restores-original-file', await fs.readFile(source, 'utf8') === content && !await exists(moved))

    await menu(sourceName, '移到回收站 (Del)')
    await mouse(button('移到回收站', `document.querySelector('.n-dialog')`))
    await waitFor(`!(${row(sourceName)})`, 'native recycle removes tree item')
    const trash = await invoke('list_library_trash', { libraryRoot: library })
    check('recycle-keeps-recoverable-content-without-source-file', !await exists(source) && trash.some(e => e.name === sourceName))
    await more(duplicateName, '资料库回收站…')
    await mouse(`document.querySelector('.trash-entry input[aria-label="选择 ${sourceName}"]')`)
    await captureSettled('installed-v112-trash-dialog.jpg')
    await mouse(button('恢复所选', `document.querySelector('.file-operation-dialog')`))
    await waitFor(`!!(${row(sourceName)}) && document.querySelector('.file-operation-dialog')?.textContent.includes('回收站为空')`, 'native restore returns original path')
    check('recycle-dialog-restores-real-file', await fs.readFile(source, 'utf8') === content && !(await invoke('list_library_trash', { libraryRoot: library })).length)
    await mouse(button('关闭', `document.querySelector('.file-operation-dialog')`))

    const copied = await invoke('transfer_library_items', { libraryRoot: library, paths: [source], targetDir: 'release-v112-target/copies', operation: 'copy' })
    check('native-copy-command-preserves-source-and-new-directory', copied.errors.length === 0 && copied.items.length === 1 && await fs.readFile(copied.items[0].newPath, 'utf8') === content && await fs.readFile(source, 'utf8') === content)
    const recycled = await invoke('trash_library_items', { libraryRoot: library, paths: [copied.items[0].newPath] })
    assert.equal(recycled.errors.length, 0)
    const [purgeEntry] = await invoke('list_library_trash', { libraryRoot: library })
    await invoke('purge_library_trash', { libraryRoot: library, ids: [purgeEntry.id] })
    check('native-purge-removes-only-selected-trash-content', !(await invoke('list_library_trash', { libraryRoot: library })).length && await fs.readFile(source, 'utf8') === content && await fs.readFile(duplicate, 'utf8') === content)
    const movedAgain = await invoke('transfer_library_items', { libraryRoot: library, paths: [duplicate], targetDir: 'release-v112-target', operation: 'move' })
    const undone = await invoke('undo_library_moves', { libraryRoot: library, items: movedAgain.items })
    check('native-move-and-undo-commands-registered', movedAgain.errors.length === 0 && undone.errors.length === 0 && await fs.readFile(duplicate, 'utf8') === content)
    check('no-global-error-overlay-after-file-operations', !await evaluate(`!!document.querySelector('#crash-screen, #runtime-error-notice, .route-error-fallback')`))
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = String(error)
    report.failureDirectory = await invoke('scan_directory', { libraryRoot: library, path: library }).catch(cause => ({ error: String(cause) }))
    report.failureTree = await evaluate(`(()=>{const trees=[],seen=new Set();const visit=v=>{if(!v||typeof v!=='object'||seen.has(v)||seen.size>6000)return;seen.add(v);const c=v.component,n=c?.type?.__name||c?.type?.name;if(c&&n==='Tree'&&Array.isArray(c.props?.data))trees.push({dataKeys:c.props.data.map(x=>x.key),expandedKeys:c.props.expandedKeys,animationInProgress:c.setupState?.aip,displayedKeys:c.setupState?.fNodes?.map(x=>x.key)});if(c)visit(c.subTree);if(Array.isArray(v.children))v.children.forEach(visit);if(v.suspense)visit(v.suspense.activeBranch)};visit(document.querySelector('#app')?._vnode);return {motion:document.body.dataset.motion,visible:document.visibilityState,focused:document.hasFocus(),trees,visiblePaths:[...document.querySelectorAll('[data-drop-path]')].filter(e=>e.getClientRects().length).map(e=>e.dataset.dropPath)}})()`).catch(() => null)
    await capture('installed-v112-failure.jpg').catch(() => {}); throw error
  }
  finally { await fs.writeFile(path.join(output, 'installed-v112-workflow.json'), JSON.stringify(report, null, 2) + '\n') }
}
