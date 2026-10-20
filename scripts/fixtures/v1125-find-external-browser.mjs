import {findFixture} from '../lib/document-find-fixture.mjs'
import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NConfigProvider,NDialogProvider,NMessageProvider} from 'naive-ui'
import TempMode from '/src/views/TempMode.vue'
import TextEditor from '/src/views/TextEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
const text=new URLSearchParams(location.search).has('text'), path='C:/external/记录.'+(text?'txt':'md')
const pinia=createPinia(),store=useAppStore(pinia), a=window.externalAudit={calls:[],disk:findFixture,copies:[],path,store}
const snapshot=()=>({path,content:a.disk,signature:a.disk,contentDigest:a.disk,size:a.disk.length,modified:1,encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true})
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'external'},currentWebview:{label:'external'}},invoke:async(command,args={})=>{
  a.calls.push({command,args})
  if(command==='read_external_text_document')return snapshot()
  if(command==='write_external_text_document'){if(args.expectedSignature!==a.disk)throw {code:'external-modified',message:'磁盘已变化'};a.disk=args.content;return snapshot()}
  if(command==='resolve_text_conflict'){
    if(a.failProtection)throw Error('草稿保护写入失败')
    if(args.expectedSignature!==a.disk)throw Error('磁盘内容再次变化')
    const copyPath=path.replace(/(\.[^.]+)$/,'-当前副本1$1');a.copies.push({path:copyPath,content:args.currentDraft})
    return {snapshot:snapshot(),copyPath}
  }
  if(command==='register_window_draft_session')return 'external-conflict'
  if(command.startsWith('plugin:event|')||command.startsWith('plugin:window|')||['report_window_draft_session','report_window_drafts','save_config','save_external_history_version'].includes(command))return
  throw Error('Unexpected external conflict IPC: '+command)
}}
store.editorMode=new URLSearchParams(location.search).get('mode')||'wysiwyg';store.configReady=true;store.loadConfig=async()=>{}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/external',component:text?TextEditor:TempMode},{path:'/library',component:{template:'<div>资料库</div>'}}]})
await router.push('/external?external=1&path='+encodeURIComponent(path))
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(NConfigProvider,{},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts');registerNaiveComponents(app);app.use(pinia).use(router).mount('#app')
