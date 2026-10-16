// Production Vue pages/components with isolated native responses, not real disk.
const surface = new URL(location.href).searchParams.get('surface')
if (!['workspace', 'table', 'graph-health'].includes(surface)) throw Error('Unknown audit surface')
const audit = { blocked: true, requests: [], repaired: false }
let internals
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  configurable: true, get: () => internals,
  set(value) {
    const original = value.invoke
    value.invoke = async (command, args) => {
      if (['set_workspace_markdown_task_state', 'write_table_file', 'repair_graph_links'].includes(command)) {
        audit.requests.push({ command, args: JSON.parse(JSON.stringify(args)), blocked: audit.blocked })
        if (audit.blocked) throw '文档正在保存或整理，请保留修改并稍后重试'
      }
      return original(command, args)
    }
    internals = value
  },
})
if (surface === 'workspace') await import('./workflow-redesign-browser.mjs')
if (surface === 'table') await import('./table-save-browser.mjs')
if (surface === 'graph-health') {
  const { createApp, h } = await import('vue')
  const { createPinia } = await import('pinia')
  const { NConfigProvider } = await import('naive-ui')
  const { default: GraphHealthPanel } = await import('/src/components/GraphHealthPanel.vue')
  const { useAppStore } = await import('/src/store/app.ts')
  const pinia = createPinia(), store = useAppStore(pinia)
  store.activeLibraryPath = 'C:/secondary-fixture'; store.configReady = true
  const candidate = { title: '目标笔记', path: 'C:/secondary-fixture/Target.md', relativePath: 'Target.md', replacementTarget: 'Target', confidence: 1 }
  const issue = { id: 'broken-1', kind: 'broken', sourcePath: 'C:/secondary-fixture/Source.md', sourceTitle: '来源笔记', targetText: 'Targt', syntax: '[[Targt|目标笔记]]', context: '用户保留的上下文与别名', line: 1, relationType: 'links-to', candidates: [candidate], recommendedCandidate: candidate }
  window.__TAURI_INTERNALS__ = { invoke: async command => {
    if (command === 'analyze_graph_health') return { brokenLinks: audit.repaired ? [] : [issue], ambiguousLinks: [], orphanNotes: [], scannedNotes: 2 }
    if (command === 'get_knowledge_graph_pulse') return null
    if (command === 'repair_graph_links') { audit.repaired = true; return { repairedLinks: 1, changedFiles: 1 } }
    throw Error('Unexpected graph health IPC: ' + command)
  } }
  await import('/src/styles/tokens.scss'); await import('/src/styles/themes.scss')
  createApp({ render: () => h(NConfigProvider, {}, () => h(GraphHealthPanel, { open: true, libraryRoot: store.libraryPath })) }).use(pinia).mount('#app')
  document.body.dataset.theme = 'white'; document.body.style.margin = '0'
}
const { useAppStore } = await import('/src/store/app.ts')
const { windowDraftCount } = await import('/src/services/windowDrafts.ts')
audit.store = useAppStore(); audit.store.motionSpeed = 'calm'
document.body.dataset.motion = 'calm'
Object.defineProperty(audit, 'draftCount', { get: () => windowDraftCount.value })
window.secondaryWriteAudit = audit
