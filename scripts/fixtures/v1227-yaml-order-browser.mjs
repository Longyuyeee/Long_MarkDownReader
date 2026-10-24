import {getThemeTone} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import {fixtureTomlKeyAnalysis,fixtureTomlReplace,fixtureTomlRename,fixtureTomlFields,fixtureTomlArrayItems,fixtureTomlArrayChange,fixtureTomlItemReplace} from './v1225-toml-analysis.mjs'
import {yamlOrderSource} from '../lib/installed-v1-2-27-evidence.mjs'
import {fixtureYamlMove} from './v1227-yaml-order-analysis.mjs'
import {fixtureYamlAnalysis,fixtureYamlReplace,fixtureYamlRename,fixtureYamlFields,fixtureYamlSequence} from './v1223-yaml-analysis.mjs'
// Real Vue editors and CodeMirror. IPC/disk are simulated; never native proof.
import {createApp,h,computed} from 'vue'
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
import '/src/styles/motion.scss'
import '/src/styles/display-preferences.scss'
import '/src/styles/workflow-surfaces.scss'
const mode=new URLSearchParams(location.search).get('format')==='yaml'?'yaml':'toml',component=mode==='yaml'?(await import('/src/views/YamlEditorView.vue')).default:(await import('/src/views/TomlEditorView.vue')).default
const sources={yaml:yamlOrderSource},other={toml:'constructor = [1]\nother = 2\n',yaml:'items: [3, 4]\nother: 2\n'}
const files={},calls=[],pending=[],listeners={};let counter=0
const snapshot=(path,content,signature)=>({path,content,signature,encoding:'utf-8',size:new TextEncoder().encode(content).length,modified:1,readOnlyReason:undefined})
for(const [label,source]of [['A',sources[mode]],['B',other[mode]]])files[`C:/ui/${label}.${mode}`]=snapshot(`C:/ui/${label}.${mode}`,source,label+'-1')
const histories={}
for(const path of Object.keys(files))histories[path]=[[10,files[path].content.replaceAll('原稿','初稿')]]
const state=window.structuredAudit={mode,files,histories,calls,pending,sources,other,sourceSelection(){const v=EditorView.findFromDOM(document.querySelector('.cm-editor'));return v.state.doc.sliceString(v.state.selection.main.from,v.state.selection.main.to)},sourceText(){return EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString()},replaceSource(text){const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text}})},holdHistoryCompare:false,holdHistoryRestore:false,holdAnalysis:false,holdRead:false,holdWrite:false,holdTransform:false,holdArrayItems:false,failRead:false,failWrite:false,failCopy:false,
 release(kind){for(const item of pending.filter(item=>!kind||item.kind===kind)){pending.splice(pending.indexOf(item),1);item.resolve()}},get pendingSaves(){return pendingDocumentSaves.value}}
const pause=async kind=>{if(state[kind]){state[kind]=false;await new Promise(resolve=>pending.push({kind,resolve}))}}
const analysis=mode==='toml'?fixtureTomlKeyAnalysis:fixtureYamlAnalysis

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
 if(command==='move_yaml_sequence_item_source'){const result=fixtureYamlMove(args);await pause('holdTransform');return result}
 if(command==='copy_toml_array_item_source'){
  const items=fixtureTomlArrayItems(args),item=items.find(i=>i.start===args.itemStart&&i.end===args.itemEnd)
  if(!item||items.some(i=>!i.editable))throw Error('复杂数组项请定位源码；草稿仍保留')
  const value=new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(args.content).slice(item.start,item.end))
  const result=fixtureTomlArrayChange({...args,afterStart:item.start,afterEnd:item.end,value});await pause('holdTransform');return result
 }
 if(command==='copy_yaml_sequence_item_source'){
  const value=new TextDecoder('utf-8',{ignoreBOM:true}).decode(new TextEncoder().encode(args.content).slice(args.start,args.end))
  const result=fixtureYamlSequence({...args,after:true,value});await pause('holdTransform');return result
 }
 if(command==='replace_yaml_value_source'){const result=fixtureYamlReplace(args);await pause('holdTransform');return result}
 if(command==='rename_yaml_key_source'){const result=fixtureYamlRename(args);await pause('holdTransform');return result}
 if(command==='add_yaml_field_source'||command==='remove_yaml_field_source'){const result=fixtureYamlFields(args,command.startsWith('remove'));await pause('holdTransform');return result}
 if(command==='add_yaml_sequence_item_source'||command==='remove_yaml_sequence_item_source'){const result=fixtureYamlSequence(args,command.startsWith('remove'));await pause('holdTransform');return result}
 if(command==='replace_toml_array_item_source'){const result=fixtureTomlItemReplace(args);await pause('holdTransform');return result}
 if(command==='inspect_toml_array_items_source'){const result=fixtureTomlArrayItems(args);await pause('holdArrayItems');return result}
 if(command==='add_toml_array_item_source'||command==='remove_toml_array_item_source'){const result=fixtureTomlArrayChange(args,command.startsWith('remove'));await pause('holdTransform');return result}
 if(command==='add_toml_field_source'||command==='remove_toml_field_source'){const result=fixtureTomlFields(args,command.startsWith('remove'));await pause('holdTransform');return result}
 if(command==='rename_toml_key_source'){const result=fixtureTomlRename(args);await pause('holdTransform');return result}
 if(command==='replace_toml_value_source'){const result=fixtureTomlReplace(args);await pause('holdTransform');return result}
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
const currentThemeTone=computed(()=>getThemeTone(store.theme,false))
const styleRadii = computed(() => VISUAL_STYLE_RADII[store.visualStyle] || VISUAL_STYLE_RADII.soft)

const themeOverrides = computed(() => ({
  common: {
    borderRadius: styleRadii.value.normal,
    borderRadiusSmall: styleRadii.value.small,
    primaryColor: currentThemeTone.value.ui.primary,
    primaryColorHover: currentThemeTone.value.ui.primary,
    primaryColorPressed: currentThemeTone.value.ui.primary,
    textColor1: currentThemeTone.value.ui.text,
    textColor2: `${currentThemeTone.value.ui.text}c7`,
    textColor3: `${currentThemeTone.value.ui.text}8f`,
    borderColor: `${currentThemeTone.value.ui.text}26`,
    popoverColor: currentThemeTone.value.ui.surface,
    hoverColor: `${currentThemeTone.value.ui.primary}14`,
    bodyColor: 'transparent',
    cardColor: currentThemeTone.value.ui.surface,
    modalColor: currentThemeTone.value.ui.surface,
  },
  Select: {
    menuBoxShadow: `0 14px 36px ${currentThemeTone.value.ui.text}24`,
    peers: {
      InternalSelection: {
        textColor: currentThemeTone.value.ui.text,
        textColorDisabled: `${currentThemeTone.value.ui.text}70`,
        placeholderColor: `${currentThemeTone.value.ui.text}8f`,
        color: currentThemeTone.value.ui.surface,
        colorDisabled: currentThemeTone.value.ui.background,
        colorActive: currentThemeTone.value.ui.surface,
        border: `1px solid ${currentThemeTone.value.ui.text}26`,
        borderHover: `1px solid ${currentThemeTone.value.ui.primary}99`,
        borderActive: `1px solid ${currentThemeTone.value.ui.primary}`,
        borderFocus: `1px solid ${currentThemeTone.value.ui.primary}`,
        boxShadowFocus: `0 0 0 3px ${currentThemeTone.value.ui.primary}24`,
        arrowColor: `${currentThemeTone.value.ui.text}a8`,
        arrowColorDisabled: `${currentThemeTone.value.ui.text}52`,
      },
      InternalSelectMenu: {
        color: currentThemeTone.value.ui.surface,
        groupHeaderTextColor: `${currentThemeTone.value.ui.text}8f`,
        actionDividerColor: `${currentThemeTone.value.ui.text}20`,
        optionTextColor: currentThemeTone.value.ui.text,
        optionTextColorPressed: currentThemeTone.value.ui.primary,
        optionTextColorDisabled: `${currentThemeTone.value.ui.text}70`,
        optionTextColorActive: currentThemeTone.value.ui.primary,
        optionCheckColor: currentThemeTone.value.ui.primary,
        optionColorPending: `${currentThemeTone.value.ui.primary}14`,
        optionColorActive: `${currentThemeTone.value.ui.primary}1f`,
        optionColorActivePending: `${currentThemeTone.value.ui.primary}2b`,
      },
    },
  },
  Dropdown: {
    borderRadius: styleRadii.value.small,
    color: currentThemeTone.value.ui.surface,
    dividerColor: `${currentThemeTone.value.ui.text}20`,
    optionTextColor: currentThemeTone.value.ui.text,
    optionTextColorHover: currentThemeTone.value.ui.text,
    optionTextColorActive: currentThemeTone.value.ui.primary,
    optionTextColorChildActive: currentThemeTone.value.ui.primary,
    optionColorHover: `${currentThemeTone.value.ui.primary}14`,
    optionColorActive: `${currentThemeTone.value.ui.primary}1f`,
    groupHeaderTextColor: `${currentThemeTone.value.ui.text}8f`,
  },
}))

const app=createApp({render:()=>h(NConfigProvider,{style:'height:100%',theme:store.theme==='dark'?darkTheme:null,themeOverrides:themeOverrides.value},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts');registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app');installAppTooltipPolicy();installHorizontalWheelNavigation();installContextMenuPolicy()
