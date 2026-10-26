import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {nativeUserInput} from './v118-native-user-input.mjs'

export async function runInstalledV114Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41'].includes(appVersion)) throw Error('Disposable 1.1.4 installation required')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args = {}) => {
    const r = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(e){return {ok:false,error:String(e)}}})()`)
    if (!r.ok) throw Error(r.error); return r.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const button = (label, root = 'document') => `[...(${root}?.querySelectorAll('button')||[])].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const ui = nativeUserInput({send,evaluate})
  const mouse = (expression, button = 'left', modifiers = 0) => ui.clickTarget(expression,button,modifiers)
  const fill = async (selector, text) => {
    await mouse(`document.querySelector(${JSON.stringify(selector)})`)
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.insertText', { text })
  }
  const snap = async name => { await waitFor(`!document.querySelector('.n-message')&&!document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity)`, 'natural motion completed'); await capture(name) }
  const md = path.join(library, 'release-v114-A.md'), txt = path.join(library, 'release-v114-B.txt'), data = path.join(library, 'release-v114-data.table.json')
  const original = '旧第一段\n\n保留中间内容\n\n旧第三段\n', current = '新第一段\n\n保留中间内容\n\n新第三段\n'
  try {
    const templates = [{ name: 'release-v114-portable', content: '# {{title}}\n{{date}}\n{{time}}\n' }], bundle = path.join(library, 'release-v114-templates.json')
    const defaults = (await invoke('get_config')).defaultNoteTemplates
    await invoke('export_note_template_bundle', { targetPath: bundle, templates })
    const imported = await invoke('read_note_template_bundle', { sourcePath: bundle })
    check('portable-template-roundtrip-retains-variables', JSON.stringify(imported.templates) === JSON.stringify(templates) && JSON.parse(await fs.readFile(bundle, 'utf8')).schemaVersion === 1)
    const before = await fs.readFile(bundle, 'utf8')
    await assert.rejects(invoke('export_note_template_bundle', { targetPath: bundle, templates: [{ name: '', content: 'invalid' }] }))
    check('invalid-template-export-preserves-file-and-defaults', await fs.readFile(bundle, 'utf8') === before && JSON.stringify((await invoke('get_config')).defaultNoteTemplates) === JSON.stringify(defaults))
    await fs.writeFile(md, current, { flag: 'wx' }); await fs.writeFile(txt, current, { flag: 'wx' }); await fs.writeFile(data, '{}', { flag: 'wx' })
    const rule = { mode: 'number', prefix: '', suffix: '', find: '', replacement: '', start: 1, digits: 2, position: 'prefix' }
    const preview = await invoke('preview_library_renames', { libraryRoot: library, paths: [data], rule })
    const invalid = await invoke('preview_library_renames', { libraryRoot: library, paths: [data], rule: { ...rule, mode: 'text', prefix: '?' } })
    check('native-rename-preview-preserves-format-and-reports-invalid-names', preview[0].newName === '01-release-v114-data.table.json' && preview[0].status === 'ready' && invalid[0].status === 'error' && await fs.readFile(data, 'utf8') === '{}')
    for (const file of [txt, md]) await invoke('save_history_version', { libraryRoot: library, path: file, content: original, maxCount: 20 })
    await navigate('#/library?path=' + encodeURIComponent(txt), '.text-workspace', 'v114 TXT partial recovery')
    await mouse(button('历史与差异', `document.querySelector('.text-toolbar')`)); await mouse(`document.querySelector('.text-history-entries button')`)
    await mouse(button('恢复此处', `document.querySelector('.history-diff-dialog')`))
    await waitFor(`!document.querySelector('.history-diff-dialog')&&document.querySelector('.cm-content')?.textContent.includes('旧第一段')`, 'TXT partial restore visible')
    check('txt-partial-restore-retains-other-change-and-disk', await evaluate(`document.querySelector('.cm-content').textContent.includes('新第三段')`) && await fs.readFile(txt, 'utf8') === current)
    await mouse(`document.querySelector('.cm-content')`)
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
    await waitFor(`document.querySelector('.cm-content')?.textContent.includes('新第一段')`, 'TXT partial restore undone')
    check('txt-partial-restore-can-be-undone', await fs.readFile(txt, 'utf8') === current)
    await navigate('#/library?path=' + encodeURIComponent(md), '.library-mode', 'v114 Markdown partial recovery')
    await waitFor(`document.querySelector('.vditor-wysiwyg pre')?.textContent.includes('新第一段')`, 'Markdown current draft')
    await mouse(`document.querySelector('#tab-history')`); await mouse(`document.querySelector('.history-bubble')`)
    await mouse(button('恢复此处', `document.querySelector('.history-diff-dialog')`))
    await waitFor(`!document.querySelector('.history-diff-dialog')&&document.querySelector('.vditor-wysiwyg')?.textContent.includes('旧第一段')`, 'Markdown partial recovery visible')
    check('markdown-partial-restore-retains-other-change-and-disk', await evaluate(`document.querySelector('.vditor-wysiwyg').textContent.includes('新第三段')`) && await fs.readFile(md, 'utf8') === current)
    await mouse(`document.querySelector('#tab-files')`)
    await mouse(`document.querySelector('[data-app-tooltip="刷新列表"],button[title="刷新列表"]')`)
    const node = file => `[...document.querySelectorAll('[data-drop-path]')].find(e=>e.getAttribute('data-drop-path').replaceAll('\\\\','/').endsWith('/'+${JSON.stringify(path.basename(file))}))`
    await mouse(node(md)); await mouse(node(txt), 'left', 2); await mouse(node(md), 'right')
    await mouse(`[...document.querySelectorAll('.n-dropdown-option-body')].find(e=>e.textContent.trim()==='批量重命名…')`)
    await fill('.batch-rename-dialog input[aria-label="名称前添加"]', '整理-')
    await waitFor(`document.querySelectorAll('.batch-rename-dialog .rename-row').length===2&&!document.querySelector('.rename-preview[aria-busy="true"]')`, 'batch rename preview ready')
    await snap('installed-v114-batch-rename.jpg')
    await mouse(button('重命名 2 项', `document.querySelector('.batch-rename-dialog')`))
    await waitFor(`document.querySelectorAll('.batch-rename-dialog .rename-row.completed').length===2`, 'batch rename complete')
    if (['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41'].includes(appVersion)) assert.ok(await evaluate(`(()=>{const tabs=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app').tabs;const keys=tabs.map(tab=>{const value=tab.path.replaceAll(String.fromCharCode(92),'/').toLowerCase();return value.startsWith('//?/unc/')?'//'+value.slice(8):value.startsWith('//?/')?value.slice(4):value});return new Set(keys).size===keys.length})()`),'a renamed file must keep one tab and its existing draft')
    check('batch-context-dialog-renames-real-files-and-retains-current-draft', await fs.readFile(path.join(library, '整理-' + path.basename(md)), 'utf8') === current && await fs.readFile(path.join(library, '整理-' + path.basename(txt)), 'utf8') === current && (await invoke('list_history', { libraryRoot: library, path: path.join(library, '整理-' + path.basename(md)) })).some(([, content]) => content === original) && await evaluate(`document.querySelector('.vditor-wysiwyg')?.textContent.includes('旧第一段')`))
    await mouse(button('完成', `document.querySelector('.batch-rename-dialog')`)); await snap('installed-v114-result.jpg')
    check('v114-workflows-have-no-global-error-overlay', !await evaluate(`!!document.querySelector('#crash-screen,#runtime-error-notice,.route-error-fallback')`))
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = String(error); await capture('installed-v114-failure.jpg').catch(() => {}); throw error }
  finally { await fs.writeFile(path.join(output, 'installed-v114-workflow.json'), JSON.stringify(report, null, 2) + '\n') }
}
