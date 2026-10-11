import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { NConfigProvider, NModal } from 'naive-ui'
import InboxBrowser from '/src/components/InboxBrowser.vue'
import ArchiveResultDialog from '/src/components/ArchiveResultDialog.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
window.inboxAudit = { calls: [], opened: [] }
window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
  window.inboxAudit.calls.push({ command, args })
  if (command === 'scan_directory') return [{ name: '会议记录.md', path: 'C:/audit/Inbox/会议记录.md', is_dir: false }, { name: '需求清单.md', path: 'C:/audit/Inbox/需求清单.md', is_dir: false }]
  if (command === 'plugin:event|listen') return 1
  if (command === 'preflight_archive') return { items: args.items.map(item => ({ sourcePath: item.sourcePath, targetPath: `C:/audit/项目/${item.targetName}`, issues: [], dependencies: { complete: false, limitations: ['dependency_inventory_incomplete'] } })), structuralChecksPassed: true, canExecute: false, pendingChecks: ['execution_time_revalidation'], windowConfirmationError: 'window_state_not_clean' }
  throw Error(`Unexpected IPC ${command}`)
}, transformCallback: () => 1 }
const pinia = createPinia(), store = useAppStore(pinia)
store.activeLibraryPath = 'C:/audit'; store.configReady = true
const results = [
  { sourcePath: 'Inbox/会议记录.md', targetPath: '项目/会议记录.md', status: 'completed', message: '正文与历史已确认' },
  { sourcePath: 'Inbox/需求清单.md', targetPath: '项目/需求清单.md', status: 'not_executed', message: '已有同名文件，原文件未移动' },
  { sourcePath: 'Inbox/交付说明.md', targetPath: '项目/交付说明.md', status: 'needs_review', message: '正文已移动，历史状态需要核对' },
]
createApp({ render: () => h(NConfigProvider, {}, { default: () => new URLSearchParams(location.search).has('results') ? h(ArchiveResultDialog, { show: true, targetDirectory: '项目', items: results, onOpen: path => window.inboxAudit.opened.push(path), onReconcile: () => window.inboxAudit.calls.push({ command: 'read-only-reconcile-requested' }), onClose: () => window.inboxAudit.calls.push({ command: 'close-retain-record' }) }) : h('div', { style: 'width:340px;height:100vh;border-right:1px solid #ddd' }, [h(InboxBrowser, { libraryRoot: store.libraryPath, onOpen: path => window.inboxAudit.opened.push(path) })]) }) }).use(pinia).component('NModal', NModal).mount('#app')
document.body.style.margin = '0'; document.body.dataset.theme = 'white'
