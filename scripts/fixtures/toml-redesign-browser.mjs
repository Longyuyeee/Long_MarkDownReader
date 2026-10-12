import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import TomlEditorView from '/src/views/TomlEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const content='# 项目配置\n[project]\ntitle = "周末计划"\nenabled = true\n'
window.tomlAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document')return {content,encoding:'utf-8',signature:'fixture',size:100,modified:1}
 if(command==='analyze_toml_source')return {valid:true,tableCount:1,arrayOfTablesCount:0,valueCount:2,maxDepth:2,outlineTruncated:false,diagnostics:[],outline:[
  {path:'project',label:'project',kind:'table',depth:0,start:7,end:16,preview:'配置分区'},
  {path:'project.title',label:'title',kind:'value',depth:1,start:17,end:31,preview:'周末计划'},
 ]}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'toml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected TOML audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/toml',component:TomlEditorView}]})
await router.push('/toml?path=C:/ui/项目配置.toml')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
