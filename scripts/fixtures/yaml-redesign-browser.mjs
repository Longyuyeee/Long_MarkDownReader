import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import YamlEditorView from '/src/views/YamlEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const content='# 项目配置\nproject:\n  title: 周末计划\n  enabled: true\n'
window.yamlAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document')return {path:args.path,content,encoding:'utf-8',signature:'fixture',size:100,modified:1}
 if(command==='analyze_yaml_source')return {valid:true,documentCount:1,nodeCount:3,maxDepth:2,anchorCount:0,aliasCount:0,taggedNodeCount:0,blockScalarCount:0,outlineTruncated:false,diagnostics:[],outline:[
  {documentIndex:0,path:'$.project',label:'project',kind:'mapping',depth:0,childCount:2,start:7,end:args.content.length,line:2,column:1,preview:'项目配置'},
  {documentIndex:0,path:'$.project.title',label:'title',kind:'scalar',depth:1,childCount:0,start:18,end:29,line:3,column:3,preview:'周末计划'},
 ]}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'yaml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected YAML audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/yaml',component:YamlEditorView}]})
await router.push('/yaml?path=C:/ui/项目配置.yaml')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
