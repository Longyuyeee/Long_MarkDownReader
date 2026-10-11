import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { NConfigProvider, NMessageProvider, NButton } from 'naive-ui'
import QuickNote from '/src/views/QuickNote.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
window.captureAudit = { calls: [], fail: false, files: {} }
window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (command, args) => {
  window.captureAudit.calls.push({ command, args })
  if (command === 'plugin:event|listen') return 1
  if (command === 'plugin:event|emit' || command === 'plugin:event|unlisten') return
  if (command === 'plugin:dialog|open') return 'C:/audit/客户项目'
  if (command === 'scan_directory') return []
  if (command === 'save_quick_note') {
    if (window.captureAudit.fail) { window.captureAudit.fail = false; throw Error('模拟磁盘失败') }
    const path = `${args.targetDir}/快速笔记_${args.operationId}.md`
    window.captureAudit.files[path] = args.content
    return path
  }
  throw Error(`Unexpected IPC ${command}`)
} }
const pinia = createPinia(), store = useAppStore(pinia)
store.activeLibraryPath = 'C:/audit'
store.libraries = [{ name: '工作资料库', path: 'C:/audit' }]
store.loadConfig = async () => {}
createApp({ render: () => h(NConfigProvider, {}, { default: () => h(NMessageProvider, {}, { default: () => h(QuickNote) }) }) }).use(pinia).component('NButton', NButton).mount('#app')
document.body.style.margin = '0'; document.body.dataset.theme = 'white'
