import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9343'
const libraryInput = process.env.LONGEDIT_R5L_LIBRARY || ''
const outputInput = process.env.LONGEDIT_R5L_OUTPUT || ''
const backupInput = process.env.LONGEDIT_R5L_BACKUP || ''
const library = path.resolve(libraryInput)
const output = path.resolve(outputInput)
const mode = process.env.LONGEDIT_R5L_MODE || ''
const backupPath = path.resolve(backupInput)
const resultPath = path.join(output, 'management-backup-index-evidence.json')
if (!libraryInput || !outputInput || !backupInput || !['prepare', 'restore'].includes(mode)) {
  throw new Error('R5L library, output, guest-only backup path, and prepare/restore mode are required')
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error('R5L installed Tauri WebView CDP target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const request = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`))
  else request.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text
    throw new Error(detail || 'WebView evaluation failed')
  }
  return result.result.value
}
const waitFor = async (expression, description, attempts = 300) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const invoke = (command, args = {}) => evaluate(`(async () => {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke bridge is unavailable')
  }
  return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})
})()`)
const assertReadyIndex = status => {
  if (status?.state !== 'ready' || status.progress !== 100 || status.sourceCount < 2 || status.objectCount < 2) {
    throw new Error(`Knowledge index did not become ready: ${JSON.stringify(status)}`)
  }
}
const sanitizedPreflight = preflight => ({
  valid: preflight.valid,
  schemaVersion: preflight.schemaVersion,
  stage: preflight.stage,
  entryCount: preflight.entryCount,
  redactedLibraryCount: preflight.redactedLibraryCount,
  savedSearchCount: preflight.savedSearchCount,
  requiresLibraryMapping: preflight.requiresLibraryMapping,
  mappingCount: preflight.requiredLibraryMappings?.length || 0,
  excluded: preflight.excluded,
  blockedReasons: preflight.blockedReasons,
})
const readPrior = async () => {
  try {
    return JSON.parse(await fs.readFile(resultPath, 'utf8'))
  } catch {
    return null
  }
}

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await waitFor(`document.querySelector('#app')?.children.length > 0`, 'installed desktop app bootstrap')

try {
  if (mode === 'prepare') {
    await fs.rm(backupPath, { force: true })
    const config = await invoke('get_config')
    if (config.activeLibraryPath !== library || config.libraries?.length !== 1 || config.savedSearches?.length !== 1) {
      throw new Error('Installed release did not load the isolated formal config.json')
    }

    const receipt = await invoke('export_management_backup', { targetPath: backupPath })
    const preflight = await invoke('preflight_management_backup_import', { backupPath })
    const requiredExclusions = ['document-body', 'api-key', 'system-credential', 'absolute-user-path']
    if (!preflight.valid || !preflight.requiresLibraryMapping ||
        preflight.requiredLibraryMappings?.length !== 1 ||
        !requiredExclusions.every(item => preflight.excluded?.includes(item))) {
      throw new Error(`Management backup privacy preflight failed: ${JSON.stringify(preflight)}`)
    }

    const firstBuild = await invoke('rebuild_knowledge_index', { libraryRoot: library })
    assertReadyIndex(firstBuild)
    const deleted = await invoke('delete_knowledge_index', { libraryRoot: library })
    if (deleted?.state !== 'missing' || deleted.cacheBytes !== 0) {
      throw new Error(`Knowledge index deletion did not reach missing: ${JSON.stringify(deleted)}`)
    }
    const rebuilt = await invoke('rebuild_knowledge_index', { libraryRoot: library })
    assertReadyIndex(rebuilt)

    await fs.writeFile(resultPath, `${JSON.stringify({
      schemaVersion: 1,
      stage: 'R5L',
      capturedAt: new Date().toISOString(),
      environment: 'disposable-windows-installed-current-artifact',
      status: 'prepare-passed-restore-pending',
      releaseCandidate: false,
      promotionEligible: false,
      sourceUserContentIncluded: false,
      checks: [
        { id: 'installed-release-formal-config-load', status: 'passed' },
        { id: 'management-backup-export', status: 'passed' },
        { id: 'management-backup-privacy-preflight', status: 'passed' },
        { id: 'knowledge-index-delete-rebuild', status: 'passed' },
      ],
      backup: {
        bytes: receipt.bytes,
        sha256: receipt.sha256,
        entryCount: receipt.entryCount,
        redactedLibraryCount: receipt.redactedLibraryCount,
        excluded: receipt.excluded,
      },
      preflight: sanitizedPreflight(preflight),
      indexBeforeRollback: {
        state: rebuilt.state,
        schemaVersion: rebuilt.schemaVersion,
        sourceCount: rebuilt.sourceCount,
        objectCount: rebuilt.objectCount,
        relationCount: rebuilt.relationCount,
        cacheBytes: rebuilt.cacheBytes,
      },
    }, null, 2)}\n`)
    console.log('R5L management backup and index prepare smoke passed')
  } else {
    const prior = await readPrior()
    if (prior?.status !== 'prepare-passed-restore-pending') {
      throw new Error('R5L prepare evidence is missing before restore')
    }
    const preflight = await invoke('preflight_management_backup_import', { backupPath })
    if (!preflight.valid || preflight.requiredLibraryMappings?.length !== 1) {
      throw new Error('R5L restore preflight did not retain one library mapping')
    }
    const pathFingerprint = preflight.requiredLibraryMappings[0].pathFingerprint
    const restored = await invoke('restore_management_backup', {
      backupPath,
      libraryMappings: [{ pathFingerprint, path: library }],
    })
    if (restored.libraryCount !== 1 || restored.savedSearchCount !== 1) {
      throw new Error(`Management restore receipt is incomplete: ${JSON.stringify(restored)}`)
    }
    const config = await invoke('get_config')
    if (config.activeLibraryPath !== library || config.libraries?.[0]?.path !== library ||
        config.savedSearches?.[0]?.query !== 'R5L') {
      throw new Error('Restored management config did not remap the isolated library')
    }
    const rebuilt = await invoke('rebuild_knowledge_index', { libraryRoot: library })
    assertReadyIndex(rebuilt)

    await evaluate(`location.hash = '#/workspace'`)
    await send('Page.reload', { ignoreCache: true })
    await delay(1000)
    await waitFor(`document.querySelector('#app')?.children.length > 0`, 'post-restore application reload')
    await waitFor(`typeof window.__TAURI_INTERNALS__?.invoke === 'function'`, 'post-restore Tauri bridge')
    const reloadedConfig = await invoke('get_config')
    if (reloadedConfig.activeLibraryPath !== library || reloadedConfig.libraries?.[0]?.path !== library) {
      throw new Error('Reloaded application did not adopt the restored library mapping')
    }

    const textFile = path.join(library, 'r5j-notes.txt')
    const jsonFile = path.join(library, 'r5j-config.json')
    const textRoute = `#/library?path=${encodeURIComponent(textFile)}`
    const jsonRoute = `#/library?path=${encodeURIComponent(jsonFile)}`
    await evaluate(`location.hash = ${JSON.stringify(textRoute)}`)
    await waitFor(`document.querySelector('.library-embedded-editor .text-workspace .cm-content')?.textContent?.includes('R5J_TEXT_SAVED') === true`, 'restored TXT reopen')
    await evaluate(`location.hash = ${JSON.stringify(jsonRoute)}`)
    await waitFor(`document.querySelector('.library-embedded-editor .json-workspace .cm-content')?.textContent?.includes('R5J_JSON_SAVED') === true`, 'restored JSON reopen')

    await fs.writeFile(resultPath, `${JSON.stringify({
      ...prior,
      completedAt: new Date().toISOString(),
      status: 'passed',
      checks: [
        ...prior.checks,
        { id: 'post-rollback-management-backup-restore', status: 'passed' },
        { id: 'post-restore-knowledge-index-rebuild', status: 'passed' },
        { id: 'post-restore-representative-file-reopen', status: 'passed' },
      ],
      restore: {
        libraryCount: restored.libraryCount,
        savedSearchCount: restored.savedSearchCount,
        warningCount: restored.warnings?.length || 0,
      },
      indexAfterRestore: {
        state: rebuilt.state,
        schemaVersion: rebuilt.schemaVersion,
        sourceCount: rebuilt.sourceCount,
        objectCount: rebuilt.objectCount,
        relationCount: rebuilt.relationCount,
        cacheBytes: rebuilt.cacheBytes,
      },
    }, null, 2)}\n`)
    console.log('R5L management restore, index rebuild, and representative reopen smoke passed')
  }
} finally {
  socket.close()
}
