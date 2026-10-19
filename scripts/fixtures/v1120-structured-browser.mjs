// Real Vue editors and CodeMirror. IPC/disk are simulated; never native proof.
import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NDialogProvider,NMessageProvider} from 'naive-ui'
import {useAppStore} from '/src/store/app.ts'
import {pendingDocumentSaves} from '/src/services/windowDrafts.ts'
import {installAppTooltipPolicy} from '/src/services/appTooltipPolicy.ts'
import {installHorizontalWheelNavigation} from '/src/services/horizontalWheel.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const params=new URLSearchParams(location.search),mode=params.get('mode')||'json',baseline=params.has('baseline')
const names={json:'Json',yaml:'Yaml',xml:'Xml',toml:'Toml'},modules=import.meta.glob('/src/views/*EditorView.vue'),old=import.meta.glob('/src/views/.v1120-baseline-*.vue')
const component=(await (baseline?old[`/src/views/.v1120-baseline-${names[mode]}.vue`]:modules[`/src/views/${names[mode]}EditorView.vue`])()).default
const sources={json:'{"value":"原稿","a/b~c":[1]}',yaml:'value: 原稿\n',xml:'<root><value>原稿</value></root>\n',toml:'value = "原稿"\n'}
const other={json:'{"value":"另一份资料"}',yaml:'value: 另一份资料\n',xml:'<root><value>另一份资料</value></root>\n',toml:'value = "另一份资料"\n'}
const files={},calls=[],pending=[],listeners={};let counter=0
const snapshot=(path,content,signature)=>({path,content,signature,encoding:'utf-8',size:new TextEncoder().encode(content).length,modified:1,readOnlyReason:undefined})
for(const [label,source]of [['A',sources[mode]],['B',other[mode]]])files[`C:/ui/${label}.${mode}`]=snapshot(`C:/ui/${label}.${mode}`,source,label+'-1')
const state=window.structuredAudit={mode,files,calls,pending,sources,other,holdAnalysis:false,holdRead:false,holdWrite:false,holdTransform:false,failRead:false,failWrite:false,failCopy:false,
 release(kind){for(const item of pending.filter(item=>!kind||item.kind===kind)){pending.splice(pending.indexOf(item),1);item.resolve()}},get pendingSaves(){return pendingDocumentSaves.value}}
const pause=async kind=>{if(state[kind]){state[kind]=false;await new Promise(resolve=>pending.push({kind,resolve}))}}
const analysis=content=>{
 const valid=!content.includes('INVALID'),bytes=new TextEncoder().encode(content),word=content.indexOf('原稿'),start=word<0?0:new TextEncoder().encode(content.slice(0,word)).length-(mode==='json'?1:0),end=word<0?bytes.length:start+(mode==='json'?8:6)
 const node={path:mode==='json'?'$.value':'/value',label:'value',name:'value',kind:'string',depth:1,childCount:0,start,end,line:1,column:1,preview:'原稿',documentIndex:0,attributeCount:0}
 return{valid,mode,rootKind:'object',nodeCount:3,propertyCount:2,maxDepth:2,commentCount:0,duplicateKeyCount:0,precisionSensitiveNumberCount:0,structureEditCandidate:valid,
 paths:[{...node,path:'$',label:'根',kind:'object',depth:0,start:0,end:bytes.length,childCount:2},node,{...node,path:'$["a/b~c"][0]',label:'[0]',kind:'number',arrayIndex:0}],pathsTruncated:false,
 diagnostics:valid?[]:[{severity:'error',code:'syntax-error',message:'源码存在错误',start:0,end:1,line:1,column:1}],outline:[node],outlineTruncated:false,
 documentCount:1,mappingCount:1,sequenceCount:0,scalarCount:1,aliasCount:0,anchorCount:0,rootName:'root',elementCount:2,attributeCount:0,namespaceCount:0,cdataCount:0,processingInstructionCount:0,doctypeCount:0,tableCount:1,keyCount:1,arrayCount:0}
}
window.__TAURI_INTERNALS__={transformCallback:()=>++counter,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args={})=>{
 calls.push({command,args:JSON.parse(JSON.stringify(args))})
 if(command.startsWith('analyze_')){const result=analysis(args.content);await pause('holdAnalysis');return result}
 if(command==='validate_local_json_schema')return{status:'no-schema',schemaApplied:false,diagnostics:[],diagnosticsTruncated:false}
 if(command.startsWith('read_')&&command.includes('text_document')){
  if(state.failRead){state.failRead=false;throw Error('模拟读取失败')}
  const result=JSON.parse(JSON.stringify(files[args.path]));await pause('holdRead');return command.endsWith('_range')?{...result,offset:0,nextOffset:result.size,eof:true,readOnlyReason:''}:result
 }
 if(command.startsWith('write_')&&command.endsWith('_source_document')){
  if(state.failWrite){state.failWrite=false;throw Error('模拟写入失败')}
  const prior=files[args.path];if(prior.signature!==args.expectedSignature)throw{code:'external-modified',message:'磁盘已被其他程序修改'}
  const result=snapshot(args.path,args.content,prior.signature+'-saved');await pause('holdWrite');files[args.path]=result;return result
 }
 if(command==='replace_json_scalar_source'){const bytes=new TextEncoder().encode(args.content),decode=b=>new TextDecoder().decode(b),result=decode(bytes.slice(0,args.start))+args.replacement+decode(bytes.slice(args.end));await pause('holdTransform');return result}
 if(command==='transform_json_source'){const result=JSON.stringify(JSON.parse(args.content),null,args.mode==='pretty'?2:0);await pause('holdTransform');return result}
 if(command==='resolve_text_conflict'){
  if(state.failCopy){state.failCopy=false;throw Error('模拟草稿副本保留失败')}
  const prior=files[args.path];if(prior.signature!==args.expectedSignature)throw Error('磁盘内容再次变化，请重新比较')
  const path=args.path.replace(/\.[^.]+$/, '-当前副本'+(++counter)+'.'+mode);files[path]=snapshot(path,args.currentDraft,'copy-'+counter);return{snapshot:prior,copyPath:path}
 }
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'v1120-owned-fixture'
 if(command==='plugin:event|listen'){listeners[args.event]=args.handler;return ++counter}
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected structured fixture IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}}
const pinia=createPinia(),store=useAppStore(pinia);store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/editor',component},{path:'/library',name:'LibraryMode',component:{template:'<div>资料库</div>'}}]})
state.store=store;state.router=router
await router.push('/editor?path=C:/ui/A.'+mode)
document.body.dataset.theme='white';document.body.dataset.style='soft';document.body.style.cssText='margin:0;font:14px "Segoe UI","Microsoft YaHei",sans-serif';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView)))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts');registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app');installAppTooltipPolicy();installHorizontalWheelNavigation()
