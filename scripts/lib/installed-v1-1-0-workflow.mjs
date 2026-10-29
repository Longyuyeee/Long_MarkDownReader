import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function sameDiskDirectory(left, right) {
  const [a, b] = await Promise.all([fs.stat(left, { bigint: true }), fs.stat(right, { bigint: true })])
  return a.isDirectory() && b.isDirectory() && a.ino !== 0n && a.dev === b.dev && a.ino === b.ino
}

// Real packaged WebView2 IPC and files in the disposable install runner only.
export async function runInstalledV110Workflow({ evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(appVersion)) throw Error('Disposable 1.1.0 installation required')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args = {}) => {
    // CDP reduces a rejected string promise to "Uncaught (in promise)" unless
    // the actual native reason is caught and serialized in the page context.
    const result = await evaluate(`(async () => { try { return { ok: true, value: await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}) }; } catch (error) { return { ok: false, error: String(error) }; } })()`)
    if (!result.ok) throw Error(result.error)
    return result.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const dir = path.join(library, 'release-v110-workflow')
  const file = path.join(dir, 'project.md')
  let config
  try {
    assert.equal(await invoke('plugin:app|version'), appVersion)
    config = await invoke('get_config')
    await fs.mkdir(dir) // Fail on collision: never replace an existing user's file.
    await fs.writeFile(file, 'Current project #project', { flag: 'wx' })
    const filters = { directory: 'release-v110-workflow', tag: 'project', modifiedWithinDays: 7 }
    const search = () => invoke('search_smart_collection', { libraryRoot: library, query: '', objectTypes: ['markdown'], filters })
    const initial = await search()
    check('smart-collection-live-directory-tag-filter', initial.results.length === 1 && initial.results[0].path.endsWith('project.md'))
    const args = { libraryRoot: library, targetDir: dir, operationId: '1123456789abcdef0123456789abcdef', content: 'Meeting note #project' }
    const saved = await invoke('save_quick_note', args)
    // Rust canonicalizes Windows paths with the extended-length prefix. Compare
    // actual directories on disk, not two different spellings of the same path.
    check('quick-note-direct-selected-directory', await sameDiskDirectory(path.dirname(saved), dir) && await fs.readFile(saved, 'utf8') === args.content)
    check('quick-note-idempotent-retry', await invoke('save_quick_note', args) === saved)
    check('smart-collection-reflects-new-save', (await search()).results.length === 2)
    await invoke('save_history_version', { libraryRoot: library, path: file, content: 'Historical project #project', maxCount: 20 })
    const [[timestamp]] = await invoke('list_history', { libraryRoot: library, path: file })
    const comparison = await invoke('compare_history_version', { libraryRoot: library, path: file, timestamp })
    const restore = { libraryRoot: library, path: file, timestamp, diskSignature: comparison.diskSignature, historySignature: comparison.historySignature }
    const copy = await invoke('restore_history_copy', restore)
    check('history-copy-preserves-original', await fs.readFile(copy, 'utf8') === 'Historical project #project' && await fs.readFile(file, 'utf8') === 'Current project #project')
    const draft = 'Unsaved user draft'
    const recovered = await invoke('prepare_history_restore', { ...restore, currentDraft: draft, maxCount: 20 })
    check('history-prepare-protects-draft', recovered === 'Historical project #project' && (await invoke('list_history', { libraryRoot: library, path: file })).some(([, content]) => content === draft))
    await fs.writeFile(file, 'External project modification #project')
    const beforeRejectedRestore = await fs.readdir(dir)
    await assert.rejects(invoke('restore_history_copy', restore), /变化/)
    assert.deepEqual(await fs.readdir(dir), beforeRejectedRestore, 'stale restore must not create an output file')
    check('stale-history-restore-is-rejected', await fs.readFile(file, 'utf8') === 'External project modification #project')
    await navigate('#/library?path=' + encodeURIComponent(file), '.library-mode', 'installed 1.1.0 document layout')
    await waitFor(`document.querySelector('.vditor-wysiwyg')?.innerText.includes('External project modification')`, 'real installed Markdown content')
    const rects = await evaluate(`(() => { const q=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}}; return {editor:q('.vditor'),nav:q('.app-navigation'),tabs:q('.workspace-tabs'),errors:!!document.querySelector('.workspace-error-state, .route-error-fallback')} })()`)
    check('installed-main-editor-layout', rects.editor?.height > 150 && rects.nav?.width > 0 && rects.tabs?.height > 0 && !rects.errors)
    report.layout = rects
    await capture('installed-v110-workflow.jpg')
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = String(error); throw error
  } finally {
    await fs.writeFile(path.join(output, 'installed-v110-workflow.json'), JSON.stringify(report, null, 2) + '\n')
  }
}
