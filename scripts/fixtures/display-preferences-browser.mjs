import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import * as naive from 'naive-ui'
import DisplayPreferencesEditor from '/src/components/DisplayPreferencesEditor.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import '/src/styles/display-preferences.scss'

const pinia = createPinia(), store = useAppStore(pinia), saves = []
store.theme = 'cream'
store.visualStyle = 'minimal'
store.fileDisplayStyles = {'C:/notes/plan.md': {icon:'flag', backgroundColor:'#fff1a8'}}
window.__TAURI_INTERNALS__ = {invoke: async (command,args) => {
  if(command === 'save_config') { saves.push(args.config); return }
  throw Error('Unexpected display fixture IPC: ' + command)
}}
window.displayAudit = {store, saves}
document.body.dataset.theme = 'white'
document.body.dataset.style = 'minimal'
const preferences = ref({...store.displayPreferences})
const app = createApp({render: () => h(naive.NConfigProvider,{}, {default:() => h(DisplayPreferencesEditor,{
  modelValue:preferences.value,
  'onUpdate:modelValue': value => {preferences.value=value; void store.updateConfig({displayPreferences:value})},
})})})
for(const [name,component] of Object.entries(naive)) if(/^N[A-Z]/.test(name)) app.component(name,component)
app.use(pinia).mount('#app')

