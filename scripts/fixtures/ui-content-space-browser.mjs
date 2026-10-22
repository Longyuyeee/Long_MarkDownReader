import { createApp, h, computed, watch } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { NConfigProvider, NDialogProvider, NMessageProvider, NPopover, NButton, NSelect, NDropdown, darkTheme } from 'naive-ui'
import TextEditorView from '/src/views/TextEditorView.vue'
import WorkspaceTabs from '/src/components/WorkspaceTabs.vue'
import WorkspaceEmbeddedDocument from '/src/components/workspace/WorkspaceEmbeddedDocument.vue'
import WorkspaceHelp from '/src/components/workspace/WorkspaceHelp.vue'
import { useAppStore } from '/src/store/app.ts'
import { installAppTooltipPolicy } from '/src/services/appTooltipPolicy.ts'
import { resolveThemeName, isDarkTheme } from '/src/config/themePresets.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const mode = new URLSearchParams(location.search).get('mode'), pinia = createPinia(), store = useAppStore(pinia), calls = []
window.uiSpaceAudit = { store, calls }
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
window.__TAURI_INTERNALS__ = { transformCallback: () => 1, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, invoke: async (command, args) => {
  calls.push({ command, args })
  if (command === 'read_text_document') return { path: args.path, content: '保留原有内容\n', encoding: 'utf-8', encodingConfidence: 'high', bom: 'none', lineEnding: 'lf', hasFinalNewline: true, signature: 'fixture', contentDigest: 'fixture', size: 21, modified: 1 }
  if (command === 'plugin:event|listen') return 1
  if (command.startsWith('plugin:event|') || ['save_config', 'report_window_draft_session'].includes(command)) return
  if (command === 'register_window_draft_session') return 'ui-space'
  throw Error('Unexpected UI fixture command: ' + command)
} }
store.activeLibraryPath = 'C:/ui'; store.configReady = true; store.theme = 'white'; store.visualStyle = 'minimal'
store.tabs = [{ id: 'C:/ui/记录.txt', path: 'C:/ui/记录.txt', title: '记录.txt', content: '保留原有内容\n', isDirty: false }]
store.activeTabId = store.tabs[0].id
watch(() => store.theme, value => document.body.dataset.theme = resolveThemeName(value, false), { immediate: true })
watch(() => store.visualStyle, value => document.body.dataset.style = value, { immediate: true })
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/text', component: TextEditorView }] })
await router.push('/text?path=C:/ui/记录.txt')
const HelpDemo = { render: () => h('main', { style: 'display:flex;align-items:center;gap:12px;padding:20px' }, [
  h(WorkspaceHelp, { text: '外侧操作说明', label: '外侧说明', 'data-testid': 'help-outside' }),
  h(NPopover, { trigger: 'click' }, { trigger: () => h(NButton, { 'data-testid': 'open-help-popover' }, () => '选项'), default: () => h('div', { style: 'display:flex;gap:12px;align-items:center' }, [h(WorkspaceHelp, { text: '弹层内操作说明', label: '弹层内说明', 'data-testid': 'help-inside' }), h(NSelect, { style: 'width:160px', options: [{ label: '第一项', value: 'one' }, { label: '第二项', value: 'two' }], value: 'one' })]) }),
  h(NDropdown, { trigger: 'click', options: [{ label: '保留的操作', key: 'action' }] }, { default: () => h(NButton, { 'data-testid': 'open-help-menu' }, () => '更多操作') }),
]) }
const Root = { render: () => mode === 'help' ? h(HelpDemo) : mode === 'embedded' ? h('div', { style: 'height:100%;display:flex;flex-direction:column' }, [h(WorkspaceTabs), h(WorkspaceEmbeddedDocument, { style: 'flex:1' }, () => h(RouterView))]) : h(RouterView) }
const theme = computed(() => isDarkTheme(store.theme, false) ? darkTheme : null)
const app = createApp({ render: () => h(NConfigProvider, { theme: theme.value, style: 'height:100%' }, () => h(NDialogProvider, {}, () => h(NMessageProvider, {}, () => h(Root)))) })
const { registerNaiveComponents } = await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app); app.use(pinia).use(router).mount('#app'); installAppTooltipPolicy()
