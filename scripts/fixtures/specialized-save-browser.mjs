// Reuse the actual Vue editor fixtures; only native responses are simulated.
// This does not provide evidence of native leases, real files or installation.
const kind = new URL(location.href).searchParams.get('editor')
if (!['canvas', 'diagram', 'mindmap'].includes(kind)) throw Error('Unknown editor fixture')
const audit = { blocked: true, writes: [], saved: null }
let internals
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  configurable: true,
  get: () => internals,
  set(value) {
    const original = value.invoke
    value.invoke = async (command, args) => {
      if (['write_canvas_file', 'write_diagram_file', 'write_opml_file'].includes(command)) {
        // Match the native JSON boundary: Vue's OPML document is a Proxy,
        // which structuredClone cannot copy, but IPC serializes normally.
        const payload = JSON.parse(JSON.stringify(args))
        audit.writes.push({ command, args: payload, blocked: audit.blocked })
        if (audit.blocked) throw '文档正在保存或整理，请保留修改并稍后重试'
        audit.saved = payload
        if (command === 'write_canvas_file') return
        return { path: payload.path, content: payload.content, document: payload.document, signature: 'saved-fixture' }
      }
      return original(command, args)
    }
    internals = value
  },
})
if (kind === 'canvas') await import('./canvas-redesign-browser.mjs')
if (kind === 'diagram') await import('./diagram-redesign-browser.mjs')
if (kind === 'mindmap') await import('./mindmap-redesign-browser.mjs')
const { useAppStore } = await import('/src/store/app.ts')
const { windowDraftCount } = await import('/src/services/windowDrafts.ts')
audit.store = useAppStore()
Object.defineProperty(audit, 'draftCount', { get: () => windowDraftCount.value })
audit.store.motionSpeed = 'calm'
document.body.dataset.motion = 'calm'
window.specializedSaveAudit = audit
