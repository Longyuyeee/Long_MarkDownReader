import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import DrawioEditorView from '/src/views/DrawioEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.drawioAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document')return {content:'<mxfile/>',encoding:'utf-8',signature:'fixture',size:9,modified:0}
 if(command==='analyze_drawio_source')return {valid:true,pageCount:2,compressedPageCount:0,totalCellCount:2,externalLinkCount:0,externalImageCount:0,diagnostics:[],pages:['草稿','交付'].map((name,i)=>({id:'page'+i,name,compressed:false,cellCount:1,vertexCount:1,edgeCount:0,width:800,height:600,cells:[{id:'node'+i,kind:'vertex',label:name,style:'',shape:'rectangle',x:30,y:30,width:180,height:80,editable:true,unknownAttributeCount:0}]}))}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'opml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected Drawio audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/drawio',component:DrawioEditorView}]})
await router.push('/drawio?path=C:/ui/季度项目流程审批与交付核对.drawio')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
