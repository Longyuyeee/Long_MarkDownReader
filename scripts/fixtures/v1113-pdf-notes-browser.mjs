import {createApp,h,computed,watch} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NDialogProvider,NMessageProvider,NConfigProvider,darkTheme} from 'naive-ui'
import PdfView from '/src/views/PdfView.vue'
import {useAppStore} from '/src/store/app.ts'
import {getThemeTone,resolveThemeName,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/display-preferences.scss'
import '/src/styles/motion.scss'
import '/src/styles/workflow-surfaces.scss'
const bytes=[...new Uint8Array(await(await fetch('/scripts/fixtures/v126-search/Paper.pdf')).arrayBuffer())]
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const annotations=Array.from({length:240},(_,i)=>({id:'annotation-'+i,kind:i%2?'comment':'highlight',page:i%2+1,color:i%3?'yellow':'blue',rects:i%2?[]:[{x:.1,y:.2,width:.3,height:.04}],quote:i%2?'':'阅读摘录 '+i,comment:'用户评论 '+i,createdAt:i,updatedAt:i}))
const state={store,calls,annotations,delay:0,fail:false,disk:'磁盘原稿',reply:null,dialog:null,saved:null}
window.pdfNotesAudit=state
window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,invoke:async(command,args)=>{
 calls.push({command,args:JSON.parse(JSON.stringify(args||{}))})
 if(command==='read_pdf_info')return {length:bytes.length,signature:'fixture',fullData:bytes}
 if(command==='read_pdf_annotations')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:bytes.length,modifiedAt:1},annotations:JSON.parse(JSON.stringify(annotations))}
 if(command==='read_pdf_ocr')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:bytes.length,modifiedAt:1},provider:{id:'tesseract-wasm',version:'fixture',languages:['eng']},pages:[]}
 if(command==='build_pdf_annotation_reference'){
  if(state.delay)await new Promise(r=>setTimeout(r,state.delay))
  if(state.fail)throw Error('模拟原生来源失败')
  const a=annotations.find(a=>a.id===args.annotationId)
  return {uri:'longedit://pdf?path=Paper.pdf&page='+a.page+'&annotation='+a.id,markdown:'> '+a.quote+'\n\n[来源](longedit://pdf?path=Paper.pdf&page='+a.page+'&annotation='+a.id+')',label:'Paper.pdf'}
 }
 if(command==='build_pdf_reading_note'){
  if(state.delay)await new Promise(r=>setTimeout(r,state.delay))
  if(state.fail)throw Error('模拟原生来源失败')
  return {sourceDigest:'a'.repeat(64),sourceSignature:'fixture',relativePath:'Paper.pdf',items:args.annotationIds.map(id=>{const a=annotations.find(a=>a.id===id);return {annotation:JSON.parse(JSON.stringify(a)),uri:'longedit://pdf?path=Paper.pdf&page='+a.page+'&annotation='+a.id+'&sha256='+'a'.repeat(64),label:'Paper.pdf · 第 '+a.page+' 页'}})}
 }
 if(command==='verify_pdf_reference'){
  if(state.delay)await new Promise(r=>setTimeout(r,state.delay))
  if(state.fail)throw Error('模拟原生来源失败')
  return {sourceDigest:'a'.repeat(64),sourceSignature:'fixture'}
 }
 if(command==='plugin:dialog|save')return state.dialog
 if(command==='save_pdf_reading_note'){if(state.fail)throw Error('目标文件已存在，未覆盖');state.saved={path:args.targetPath,content:args.content};return args.targetPath}
 if(command==='read_markdown_file')return {content:state.disk}
 if(command==='write_markdown_file'){state.disk=args.content;return}
 if(command==='read_text_document')return {content:state.disk,signature:'original',contentDigest:'digest',encoding:'utf-8',bom:'none',lineEnding:'lf',hasFinalNewline:false}
 if(command==='write_pdf_annotations'){annotations.splice(0,annotations.length,...JSON.parse(JSON.stringify(args.document.annotations)));return}
 if(command==='save_config')return
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unmocked PDF notes audit IPC '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/pdf-fixture';store.configReady=true;store.theme='white'
store.tabs=[{id:'note',path:'C:/pdf-fixture/笔记.md',title:'笔记.md',content:'尚未保存的用户草稿',isDirty:true,textSignature:'original',textContentDigest:'digest'}];store.activeTabId='note'
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/pdf',component:PdfView},{path:'/library',name:'LibraryMode',component:{render:()=>h('main',{'data-testid':'draft-target'},store.tabs.find(t=>t.id===store.activeTabId)?.content)}}]})
state.router=router
await router.push('/pdf?path=C:/pdf-fixture/Paper.pdf')
store.motionSpeed='normal'
const systemDark=matchMedia('(prefers-color-scheme: dark)').matches
watch(()=>store.theme,value=>{document.body.dataset.theme=resolveThemeName(value,systemDark);document.body.classList.toggle('is-dark',isDarkTheme(value,systemDark))},{immediate:true})
watch(()=>store.visualStyle,value=>document.body.dataset.style=value,{immediate:true})
watch(()=>store.motionSpeed,value=>document.body.dataset.motion=value,{immediate:true})
const overrides=computed(()=>{const tone=getThemeTone(store.theme,systemDark).ui,radius=VISUAL_STYLE_RADII[store.visualStyle]||VISUAL_STYLE_RADII.soft;return {common:{primaryColor:tone.primary,primaryColorHover:tone.primary,primaryColorPressed:tone.primary,textColor1:tone.text,textColor2:tone.text+'c7',textColor3:tone.text+'8f',borderColor:tone.text+'26',cardColor:tone.surface,modalColor:tone.surface,popoverColor:tone.surface,bodyColor:'transparent',borderRadius:radius.normal,borderRadiusSmall:radius.small}}})
createApp({render:()=>h(NConfigProvider,{style:{height:'100%'},theme:isDarkTheme(store.theme,systemDark)?darkTheme:null,themeOverrides:overrides.value},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))}).use(pinia).use(router).mount('#app')
