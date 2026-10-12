import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import DiagramStudio from '/src/views/DiagramStudio.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.diagramAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_diagram_file')return {path:'项目.mmd',signature:'fixture',content:'flowchart LR\n A[开始] --> B[检查文档]'}
 if(command==='analyze_diagram_source')return {supported:true,diagramType:'flowchart',nodes:[{id:'A',label:'开始',shape:'rectangle',line:2,editable:true},{id:'B',label:'检查文档',shape:'rectangle',line:2,editable:true}],edges:[],warnings:[]}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'opml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected Diagram audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/diagram',component:DiagramStudio}]})
await router.push('/diagram?path=C:/ui/项目.mmd')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
