import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:14330'
const appOrigin = process.env.LONGEDIT_UX33I_APP_ORIGIN || 'http://127.0.0.1:14200'
const output = path.resolve(process.env.LONGEDIT_UX33I_AUDIT_OUTPUT || 'docs/evidence/ux33i-docx-hyperlink-desktop')
const sourceCommit = process.env.LONGEDIT_UX33I_SOURCE_COMMIT || ''
const fixtures = JSON.parse(process.env.LONGEDIT_UX33I_FIXTURES || '[]')
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('UX-33I requires a full source commit')
if (fixtures.length !== 3) throw new Error('UX-33I requires exactly three native producer fixtures')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.url.startsWith(appOrigin))
if (!target?.webSocketDebuggerUrl) throw new Error('LongEdit Tauri WebView CDP target was not found')

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'WebView evaluation failed')
  return result.result.value
}
const waitFor = async (expression, description, attempts = 500) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
const capture = async fileName => {
  const screenshot = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 92, fromSurface: true, captureBeyondViewport: false,
  })
  await fs.writeFile(path.join(output, fileName), Buffer.from(screenshot.data, 'base64'))
}
const navigate = async fixture => {
  const route = `#/library?path=${encodeURIComponent(fixture.path)}`
  const sampleName = path.basename(fixture.path, path.extname(fixture.path))
  await evaluate(`location.hash = ${JSON.stringify(route)}`)
  await waitFor(`location.hash === ${JSON.stringify(route)}`, `${fixture.id} managed route`)
  await waitFor(
    `document.querySelector('.docx-workspace .document-title strong')?.textContent.includes(${JSON.stringify(sampleName)}) === true`,
    `${fixture.id} document identity`,
  )
  await waitFor(
    `(() => { const node = document.querySelector('.page-loader'); return !node || getComputedStyle(node).opacity === '0' || node.getBoundingClientRect().width === 0 })()`,
    `${fixture.id} visible route overlay dismissal`,
  )
  await waitFor(`document.querySelector('.docx-workspace .docx-page') !== null`, `${fixture.id} DOCX page`)
  await waitFor(`!document.querySelector('.docx-workspace [role="alert"]')`, `${fixture.id} error-free load`)
  await delay(350)
  return route
}
const openEditor = () => evaluate(`(() => {
  if (document.querySelector('.docx-editor')) return true
  const button = document.querySelector('.docx-toolbar button[title="打开 DOCX 页面编辑"]')
  if (!button || button.disabled) return false
  button.click()
  return true
})()`)
const selectFirstLinkTarget = () => evaluate(`(() => {
  const select = document.querySelector('.docx-editor .edit-field select')
  if (!select) return null
  const option = [...select.options].find(item => item.textContent.trim().startsWith('链接文字'))
  if (!option) return null
  select.value = option.value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  return { value: option.value, label: option.textContent.trim() }
})()`)
const editSelectedText = suffix => evaluate(`(() => {
  const textarea = document.querySelector('.docx-editor .edit-field textarea')
  if (!textarea) return null
  const before = textarea.value
  textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(suffix)} }))
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(textarea, before + ${JSON.stringify(suffix)})
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(suffix)} }))
  return { before, after: textarea.value }
})()`)
const clickByTitle = title => evaluate(`(() => {
  const button = document.querySelector(${JSON.stringify(`button[title="${title}"]`)})
  if (!button || button.disabled) return false
  button.click()
  return true
})()`)

await fs.mkdir(output, { recursive: true })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false })
await waitFor(`document.querySelector('.page-loader') === null && document.querySelector('.library-mode') !== null`, 'initialized library shell')

const results = []
for (const fixture of fixtures) {
  const initialSourceSha256 = await sha256(fixture.source)
  const initialCopySha256 = await sha256(fixture.path)
  if (initialSourceSha256 !== fixture.sourceSha256 || initialCopySha256 !== fixture.sourceSha256) {
    throw new Error(`${fixture.id} fixture digest changed before desktop audit`)
  }
  await navigate(fixture)
  const editorAvailable = await openEditor()
  if (editorAvailable) await waitFor(`document.querySelector('.docx-editor') !== null`, `${fixture.id} editor panel`)

  const initialState = await evaluate(`(() => {
    const select = document.querySelector('.docx-editor .edit-field select')
    const labels = select ? [...select.options].map(item => item.textContent.trim()) : []
    const root = document.querySelector('.docx-workspace')
    return {
      linkTargetLabels: labels.filter(label => label.startsWith('链接文字')),
      editableHyperlinkCount: root?.querySelectorAll('.editable-hyperlink').length || 0,
      documentTitle: root?.querySelector('.document-title strong')?.textContent?.trim() || '',
      errorText: root?.querySelector('[role="alert"]')?.textContent?.trim() || '',
    }
  })()`)

  const expectedEditableLinks = fixture.id === 'wps-writer' ? 0 : 2
  if (initialState.linkTargetLabels.length !== expectedEditableLinks) {
    throw new Error(`${fixture.id} expected ${expectedEditableLinks} link targets, got ${initialState.linkTargetLabels.length}`)
  }
  if (initialState.editableHyperlinkCount !== expectedEditableLinks) {
    throw new Error(`${fixture.id} page expected ${expectedEditableLinks} editable link markers, got ${initialState.editableHyperlinkCount}`)
  }

  const result = {
    producerId: fixture.id,
    route: `#/library?path=<isolated-library>/${encodeURIComponent(path.basename(fixture.path))}`,
    sourceFile: path.basename(fixture.source),
    sourceSha256: fixture.sourceSha256,
    editorAvailable,
    expectedEditableLinks,
    linkTargetLabels: initialState.linkTargetLabels,
    editableHyperlinkCount: initialState.editableHyperlinkCount,
    linkPromptVerified: false,
    draftCreated: false,
    undoVerified: false,
    redoVerified: false,
    isolatedPreviewVerified: false,
    saveBoundaryVerified: false,
    copySaveReachable: false,
    sourceUnchanged: false,
    screenshots: [],
  }

  if (expectedEditableLinks > 0) {
    if (!editorAvailable) throw new Error(`${fixture.id} editor unexpectedly unavailable`)
    const selected = await selectFirstLinkTarget()
    if (!selected) throw new Error(`${fixture.id} link target could not be selected`)
    await waitFor(
      `[...document.querySelectorAll('.docx-editor .edit-field > span')].some(node => node.textContent.trim() === '替换链接文字（地址保持不变）')`,
      `${fixture.id} link-address boundary prompt`,
    )
    result.linkPromptVerified = true

    const change = await editSelectedText(' [UX33I 草稿]')
    if (!change || change.before === change.after) throw new Error(`${fixture.id} draft text did not change`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '1/32'`, `${fixture.id} draft creation`)
    result.draftCreated = true

    if (!(await clickByTitle('撤销草稿修改'))) throw new Error(`${fixture.id} undo was unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '0/32'`, `${fixture.id} undo`)
    result.undoVerified = true

    if (!(await clickByTitle('重做草稿修改'))) throw new Error(`${fixture.id} redo was unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '1/32'`, `${fixture.id} redo`)
    result.redoVerified = true

    const targetScreenshot = `${fixture.id}-link-draft.jpg`
    await capture(targetScreenshot)
    result.screenshots.push(targetScreenshot)

    const verifyStarted = await evaluate(`(() => {
      const button = document.querySelector('.docx-editor .verify-edit')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`)
    if (!verifyStarted) throw new Error(`${fixture.id} isolated preview was unavailable`)
    await waitFor(
      `document.querySelector('.docx-editor .edit-verification:not(.error)')?.textContent.includes('隔离验证通过')`,
      `${fixture.id} isolated preview`,
    )
    result.isolatedPreviewVerified = true
    const saveState = await evaluate(`(() => {
      const region = document.querySelector('.docx-editor .copy-save')
      const text = region?.textContent || ''
      return {
        overwriteBoundary: text.includes('会覆盖当前 DOCX') && text.includes('保存前再次检查外部修改'),
        copySaveReachable: text.includes('或者另存副本') && text.includes('另存新 DOCX 并打开'),
      }
    })()`)
    if (!saveState.overwriteBoundary || !saveState.copySaveReachable) {
      throw new Error(`${fixture.id} save boundary copy is incomplete`)
    }
    result.saveBoundaryVerified = true
    result.copySaveReachable = true
    await evaluate(`document.querySelector('.docx-editor')?.scrollTo({ top: document.querySelector('.docx-editor').scrollHeight, behavior: 'instant' })`)
    await delay(150)
    const previewScreenshot = `${fixture.id}-isolated-preview.jpg`
    await capture(previewScreenshot)
    result.screenshots.push(previewScreenshot)

    if (!(await clickByTitle('撤销草稿修改'))) throw new Error(`${fixture.id} cleanup undo was unavailable`)
    await waitFor(`document.querySelector('.draft-list header span')?.textContent.trim() === '0/32'`, `${fixture.id} draft cleanup`)
  } else {
    const screenshot = `${fixture.id}-readonly-field-links.jpg`
    await capture(screenshot)
    result.screenshots.push(screenshot)
  }

  result.sourceUnchanged = await sha256(fixture.source) === initialSourceSha256
    && await sha256(fixture.path) === initialCopySha256
  if (!result.sourceUnchanged) throw new Error(`${fixture.id} source or working copy changed during preview audit`)
  results.push(result)
}

await fs.writeFile(path.join(output, 'audit-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  environment: 'Tauri Debug WebView2 via Chrome DevTools Protocol',
  evidenceBoundary: 'real desktop WebView; not an installed MSI/NSIS lifecycle claim',
  sourceCommit,
  viewport: { width: 1365, height: 900, deviceScaleFactor: 1 },
  results,
}, null, 2)}\n`)

await send('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(`UX-33I captured ${results.reduce((count, result) => count + result.screenshots.length, 0)} desktop screenshots`)
