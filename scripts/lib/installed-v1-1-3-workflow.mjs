import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function runInstalledV113Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34'].includes(appVersion)) throw Error('Disposable 1.1.3 installation required')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args = {}) => {
    const result = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error:String(error)}}})()`)
    if (!result.ok) throw Error(result.error)
    return result.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const point = expression => `(()=>{const e=${expression};if(!e||e.disabled)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`
  const mouse = async (expression, button = 'left') => {
    await waitFor(`!!(${expression})`, 'foundation control exists')
    await evaluate(`(${expression}).scrollIntoView({block:'nearest'})`)
    await waitFor(point(expression), 'foundation control clickable')
    const coordinates = await evaluate(point(expression))
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...coordinates, button, clickCount: 1 })
  }
  const button = (label, root = 'document') => `[...(${root}?.querySelectorAll('button')||[])].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const item = label => `[...document.querySelectorAll('.n-dropdown-option-body')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const fill = async (selector, value) => {
    await mouse(`document.querySelector(${JSON.stringify(selector)})`)
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.insertText', { text: value })
  }
  const settledCapture = async name => {
    await waitFor(`!document.querySelector('.n-message')&&!document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity)`, 'natural motion completion')
    await capture(name)
  }
  const source = path.join(library, 'release-v113-source.md'), text = path.join(library, 'release-v113-history.txt')
  const originalText = '第一版安装记录\n保留原文。'
  try {
    await fs.writeFile(source, '# release-v113-source\n\n#releaseproject #releasework\n\n可重复使用的笔记结构。\n', { flag: 'wx' })
    await fs.writeFile(text, originalText, { flag: 'wx' })
    await navigate('#/library?path=' + encodeURIComponent(source), '.library-mode', 'foundation source')
    await waitFor(`document.querySelector('.vditor-wysiwyg pre')?.textContent.includes('release-v113-source')`, 'source editor loaded')
    await settledCapture('installed-v113-main.jpg')
    await mouse(`document.querySelector('[data-testid="library-document-menu"]')`)
    await mouse(button('保存为模板…'))
    await waitFor(`!!document.querySelector('.note-template-dialog')`, 'template manager open')
    await fill('.note-template-dialog input[aria-label="模板名称"]', 'release-v113-template')
    await fill('.note-template-dialog textarea[aria-label="模板正文"]', '# {{title}}\n日期：{{date}}\n时间：{{time}}\n\n## 工作记录\n')
    await mouse(button('保存模板', `document.querySelector('.note-template-dialog')`))
    await waitFor(`(async()=>{const config=await window.__TAURI_INTERNALS__.invoke('get_config');return config.noteTemplates?.some(item=>item.name==='release-v113-template')})()`, 'template persisted by native configuration')
    const config = await invoke('get_config'), template = config.noteTemplates.find(item => item.name === 'release-v113-template')
    const templateRoot = config.activeLibraryPath
    check('template-dialog-persists-custom-content', template.content.includes('{{title}}') && template.content.includes('{{date}}'))
    await evaluate(`(()=>{const e=document.querySelector('#default-note-template');e.value=${JSON.stringify(template.id)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await waitFor(`(async()=>{const c=await window.__TAURI_INTERNALS__.invoke('get_config');return c.defaultNoteTemplates?.[${JSON.stringify(templateRoot)}]===${JSON.stringify(template.id)}})()`, 'library template default saved')
    check('library-default-template-survives-native-read', (await invoke('get_config')).defaultNoteTemplates[templateRoot] === template.id)
    await settledCapture('installed-v113-template-dialog.jpg')
    await mouse(button('关闭', `document.querySelector('.note-template-dialog')`))
    const created = await invoke('create_note_from_template', { libraryRoot: library, targetDir: library, name: template.name, content: template.content })
    const second = await invoke('create_note_from_template', { libraryRoot: library, targetDir: library, name: template.name, content: template.content })
    check('template-variables-and-unique-title-written-to-disk', /^# release-v113-template\r?\n日期：\d{4}-\d{2}-\d{2}/.test(await fs.readFile(created, 'utf8')) && (await fs.readFile(second, 'utf8')).startsWith('# release-v113-template 1\n'))
    const sourceTab = `[...document.querySelectorAll('.workspace-tab')].find(e=>e.textContent.includes('release-v113-source'))`
    await mouse(sourceTab, 'right'); await mouse(item('固定标签'))
    check('tab-pin-context-menu-updates-installed-ui', await evaluate(`(${sourceTab})?.classList.contains('pinned')`))
    const collection = await invoke('search_smart_collection', { libraryRoot: library, query: '', objectTypes: ['markdown'], filters: { directory: '', tag: 'releaseproject', tags: ['releasework'], modifiedWithinDays: null } })
    check('multiple-tag-filter-reads-real-notes', collection.results.some(entry => path.toNamespacedPath(path.resolve(entry.path)).toLowerCase() === path.toNamespacedPath(path.resolve(source)).toLowerCase()) && collection.results.length === 1)
    const relation = await invoke('save_file_relation', { libraryRoot: library, sourcePath: source, targetPath: text, relationType: 'related', note: '安装测试关系' })
    const edited = await invoke('update_file_relation', { libraryRoot: library, relationId: relation.id, relationType: 'cites', note: '已修订的参考说明' })
    await mouse(`document.querySelector('#tab-links')`)
    await waitFor(`document.querySelector('.manual-file-relations')?.textContent.includes('已修订的参考说明')`, 'edited relationship in installed sidebar')
    check('manual-relation-edit-retains-files-and-refreshes-list', edited.relationType === 'cites' && await fs.readFile(text, 'utf8') === originalText && (await invoke('list_file_relations', { libraryRoot: library, path: source }))[0].note === '已修订的参考说明')
    await invoke('save_history_version', { libraryRoot: library, path: text, content: originalText, maxCount: 10 })
    const snapshot = await invoke('read_text_document', { libraryRoot: library, path: text, formatId: 'plain-text' })
    const updated = '第二版安装记录\n本次新增内容。'
    await invoke('write_text_document', { libraryRoot: library, path: text, formatId: 'plain-text', content: updated, expectedSignature: snapshot.signature })
    await invoke('save_history_version', { libraryRoot: library, path: text, content: updated, maxCount: 10 })
    await navigate('#/library?path=' + encodeURIComponent(text), '.text-workspace', 'TXT history workspace')
    await mouse(button('历史与差异', `document.querySelector('.text-toolbar')`))
    // Keep the exact two-version assertion, excluding the new per-row menu controls.
    // Direct children retain compatibility with the earlier history dialog.
    const historyButtons = '.text-history-entries > button, .text-history-entries .history-version-button'
    await waitFor(`document.querySelectorAll(${JSON.stringify(historyButtons)}).length===2`, 'native text history listed')
    await mouse(`[...document.querySelectorAll(${JSON.stringify(historyButtons)})].at(-1)`)
    await mouse(button('恢复为副本'))
    await waitFor(`decodeURIComponent(location.hash).includes('恢复-')`, 'TXT recovery copy opened')
    const files = await fs.readdir(library)
    const recovered = files.find(name => name.startsWith('release-v113-history-恢复-') && name.endsWith('.txt'))
    check('txt-history-dialog-creates-copy-without-overwrite', Boolean(recovered) && await fs.readFile(path.join(library, recovered), 'utf8') === originalText && await fs.readFile(text, 'utf8') === updated)
    await settledCapture('installed-v113-text-history-result.jpg')
    check('foundation-workflow-has-no-global-error-overlay', !await evaluate(`!!document.querySelector('#crash-screen,#runtime-error-notice,.route-error-fallback')`))
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = String(error); await capture('installed-v113-failure.jpg').catch(() => {}); throw error }
  finally { await fs.writeFile(path.join(output, 'installed-v113-workflow.json'), JSON.stringify(report, null, 2) + '\n') }
}
