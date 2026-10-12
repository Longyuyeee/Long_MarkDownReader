import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import JsonEditorView from '/src/views/JsonEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const jsonc=new URLSearchParams(location.search).has('jsonc')
const content=(jsonc?'// 用户配置\n':'')+'{"title":"项目计划","enabled":true}'
window.jsonAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document'||command==='read_text_document_range')return {path:args.path,content,encoding:'utf-8',signature:'fixture',size:100,modified:1,offset:0,nextOffset:100,eof:true}
 if(command==='validate_local_json_schema')return {status:'no-schema',schemaApplied:false,diagnostics:[],diagnosticsTruncated:false}
 if(command==='analyze_json_source'){
  const start=args.content.indexOf('{'),end=args.content.lastIndexOf('}')+1
  return {valid:true,mode:jsonc?'jsonc':'json',rootKind:'object',nodeCount:3,propertyCount:2,maxDepth:2,commentCount:jsonc?1:0,duplicateKeyCount:0,precisionSensitiveNumberCount:0,structureEditCandidate:true,pathsTruncated:false,diagnostics:[],paths:[
   {path:'$',label:'根对象',kind:'object',depth:1,childCount:2,start,end,line:1,column:1,preview:'{…}'},
   {path:'$.title',label:'title',kind:'string',depth:2,childCount:0,start:args.content.indexOf('"项目计划"'),end:args.content.indexOf('"项目计划"')+6,line:1,column:10,preview:'项目计划'},
   {path:'$.enabled',label:'enabled',kind:'boolean',depth:2,childCount:0,start:args.content.indexOf('true'),end:args.content.indexOf('true')+4,line:1,column:20,preview:'true'},
  ]}
 }
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'json-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected JSON audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/json',component:JsonEditorView}]})
await router.push('/json?path=C:/ui/项目配置.'+(jsonc?'jsonc':'json'))
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
