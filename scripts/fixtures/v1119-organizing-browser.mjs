// Real Vue pages; owned simulated IPC/disk only, never native acceptance.
import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import CanvasView from '/src/views/CanvasView.vue'
import MindMapView from '/src/views/MindMapView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const clone=v=>JSON.parse(JSON.stringify(v)),pinia=createPinia(),store=useAppStore(pinia),files={},calls=[],pending=[]
const canvas=label=>({nodes:[{id:'a',type:'text',text:label,x:0,y:0,width:260,height:160,custom:{keep:'未知字段'}},{id:'b',type:'text',text:'检查资料',x:350,y:0,width:240,height:160}],edges:[{id:'edge',fromNode:'a',toNode:'b',label:'下一步'}],vendor:{keep:true}})
const opml=label=>({title:label,metadata:{ownerName:'用户'},roots:[{id:'root',text:label,note:'原始备注',collapsed:false,attributes:{custom:'保留'},children:[{id:'child',text:'检查资料',note:'',collapsed:false,attributes:{},children:[]}]}]})
for(const kind of ['canvas','opml'])for(const id of ['A','B'])files[`C:/ui/${id}.${kind}`]={signature:id+'-1',...(kind==='canvas'?{content:JSON.stringify(canvas(id))}:{document:opml(id),preservationIssues:[]})}
const state=window.organizingAudit={files,calls,pending,holdRead:false,holdWrite:false,peer(path,value){Object.assign(files[path],value);files[path].signature+='-peer'},release(){for(const item of pending.splice(0))item.resolve()}}
const pause=async kind=>{if(state[kind]){state[kind]=false;await new Promise(resolve=>pending.push({resolve,kind}))}}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args={})=>{
 calls.push({command,args:clone(args)})
 if(/^read_(?:external_)?(?:canvas|opml)_file$/.test(command)){
  const value=clone(files[args.path]);if(!value)throw Error('资料不存在');await pause('holdRead');return {path:args.path,encoding:'UTF-8',...value}
 }
 if(/^write_(?:external_)?(?:canvas|opml)_file$/.test(command)){
  const before=files[args.path];if(!before)throw Error('资料不存在')
  if(args.expectedSignature&&before.signature!==args.expectedSignature)throw {code:'external-modified',message:'文件已被其他程序修改，未覆盖'}
  const saved={signature:before.signature+'-saved',...(args.content?{content:args.content}:{document:clone(args.document),preservationIssues:[]})}
  await pause('holdWrite');files[args.path]=clone(saved);return {path:args.path,encoding:'UTF-8',...saved}
 }
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'v1119-owned-fixture'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected organizing audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/canvas',component:CanvasView},{path:'/mindmap',component:MindMapView},{path:'/library',name:'LibraryMode',component:{template:'<div class="destination">已打开资料</div>'}}]})
state.router=router;state.store=store
const mode=new URLSearchParams(location.search).get('mode')==='opml'?'opml':'canvas'
await router.push(`/${mode==='opml'?'mindmap':'canvas'}?path=C:/ui/A.${mode}`)
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts');registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
