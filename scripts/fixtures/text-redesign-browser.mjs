import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import TextEditorView from '/src/views/TextEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const html=new URLSearchParams(location.search).has('html')
const content=html?'<h1>项目说明</h1><p>当前草稿安全预览</p><script>window.unsafeRan=true</script>':'项目说明\n先保留用户原有内容。\n再改善编辑体验。\n'
window.textAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document')return {path:args.path,content,encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true,signature:'fixture',contentDigest:'fixture',size:content.length,modified:1}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'text-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected text audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/text',component:TextEditorView}]})
await router.push('/text?path=C:/ui/项目说明.'+(html?'html':'txt'))
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
