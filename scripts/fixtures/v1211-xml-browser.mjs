import {fixtureXmlAnalysis,fixtureXmlReplace} from './v1211-xml-analysis.mjs'
import {xmlAttributeSource} from '../lib/installed-v1-2-11-evidence.mjs'
// Real Vue editors and CodeMirror. IPC/disk are simulated; never native proof.
import {createApp,h} from 'vue'
import {EditorView} from '@codemirror/view'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import {useAppStore} from '/src/store/app.ts'
import {pendingDocumentSaves} from '/src/services/windowDrafts.ts'
import {installAppTooltipPolicy} from '/src/services/appTooltipPolicy.ts'
import {installHorizontalWheelNavigation} from '/src/services/horizontalWheel.ts'
import {installContextMenuPolicy} from '/src/services/contextMenuPolicy.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const mode='xml',component=(await import('/src/views/XmlEditorView.vue')).default
const sources={xml:xmlAttributeSource+'\n'},other={xml:'<other value="另一份资料"/>\n'}
const files={},calls=[],pending=[],listeners={};let counter=0
const snapshot=(path,content,signature)=>({path,content,signature,encoding:'utf-8',size:new TextEncoder().encode(content).length,modified:1,readOnlyReason:undefined})
for(const [label,source]of [['A',sources[mode]],['B',other[mode]]])files[`C:/ui/${label}.${mode}`]=snapshot(`C:/ui/${label}.${mode}`,source,label+'-1')
const histories={}
for(const path of Object.keys(files))histories[path]=[[10,files[path].content.replaceAll('原稿','初稿')]]
const state=window.structuredAudit={mode,files,histories,calls,pending,sources,other,sourceText(){return EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()},replaceSource(text){const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}})},holdHistoryCompare:false,holdHistoryRestore:false,holdAnalysis:false,holdRead:false,holdWrite:false,holdTransform:false,failRead:false,failWrite:false,failCopy:false,
 release(kind){for(const item of pending.filter(item=>!kind||item.kind===kind)){pending.splice(pending.indexOf(item),1);item.resolve()}},get pendingSaves(){return pendingDocumentSaves.value}}
const pause=async kind=>{if(state[kind]){state[kind]=false;await new Promise(resolve=>pending.push({kind,resolve}))}}
const analysis=fixtureXmlAnalysis

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
 if(command==='replace_xml_attribute_source'){const result=fixtureXmlReplace(args);await pause('holdTransform');return result}
 if(command==='replace_json_scalar_source'){const bytes=new TextEncoder().encode(args.content),decode=b=>new TextDecoder().decode(b),result=decode(bytes.slice(0,args.start))+args.replacement+decode(bytes.slice(args.end));await pause('holdTransform');return result}
 if(command==='transform_json_source'){const result=JSON.stringify(JSON.parse(args.content),null,args.mode==='pretty'?2:0);await pause('holdTransform');return result}
 if(command==='resolve_text_conflict'){
  if(state.failCopy){state.failCopy=false;throw Error('模拟草稿副本保留失败')}
  const prior=files[args.path];if(prior.signature!==args.expectedSignature)throw Error('磁盘内容再次变化，请重新比较')
  const path=args.path.replace(/\.[^.]+$/, '-当前副本'+(++counter)+'.'+mode);files[path]=snapshot(path,args.currentDraft,'copy-'+counter);return{snapshot:prior,copyPath:path}
 }
 if(command==='save_history_version'){const list=histories[args.path]||=[];if(list[0]?.[1]!==args.content)list.unshift([11+(++counter),args.content]);return}
 if(command==='list_history')return JSON.parse(JSON.stringify(histories[args.path]||[]))
 if(command==='get_history_metadata')return {}
 if(command==='set_history_metadata'||command==='delete_history_version')return
 if(command==='compare_history_version'){const result={content:histories[args.path].find(e=>e[0]===args.timestamp)[1],disk:files[args.path].content,diskSignature:files[args.path].signature,historySignature:'history-'+args.timestamp};await pause('holdHistoryCompare');return result}
 if(command==='prepare_history_restore'||command==='restore_history_copy'){
  await pause('holdHistoryRestore');if(files[args.path].signature!==args.diskSignature)throw Error('磁盘已变化，请重新比较')
  const content=histories[args.path].find(e=>e[0]===args.timestamp)[1]
  if(command==='prepare_history_restore'){histories[args.path].unshift([11+(++counter),args.currentDraft]);return content}
  const path=args.path.replace(/\.[^.]+$/, '-恢复-'+(++counter)+'.'+mode);files[path]=snapshot(path,content,'copy-'+counter);return path
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
const app=createApp({render:()=>h(NConfigProvider,{style:'height:100%',theme:store.theme==='dark'?darkTheme:null},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts');registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app');installAppTooltipPolicy();installHorizontalWheelNavigation();installContextMenuPolicy()
