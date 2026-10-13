import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { NDialogProvider, NMessageProvider } from 'naive-ui'
import PdfView from '/src/views/PdfView.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/display-preferences.scss'

const bytes = [...new Uint8Array(await (await fetch('/scripts/fixtures/v126-search/Paper.pdf')).arrayBuffer())]
const pinia = createPinia(), store = useAppStore(pinia)
const calls = []
window.__TAURI_INTERNALS__ = {transformCallback:()=>1, metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_pdf_info'||command==='read_external_pdf_info')return {length:bytes.length,signature:'fixture-pdf',fullData:bytes}
 if(command==='read_pdf_annotations')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:bytes.length,modifiedAt:1,fingerprint:''},annotations:[]}
 if(command==='read_pdf_ocr')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:bytes.length,modifiedAt:1,fingerprint:''},provider:{id:'tesseract-wasm',version:'fixture',languages:['eng']},updatedAt:1,pages:[]}
 if(command==='inspect_pdf_form_structure')return {status:'no_form',sourceDigest:'fixture',sourceBytes:bytes.length,pageCount:2,hasAcroForm:false,needAppearances:false,fieldCount:0,widgetCount:0,fieldTypeCounts:{},duplicateFieldNames:[],orphanWidgetCount:0,missingAppearanceCount:0,fillableCandidateCount:0,blockers:[],diagnostics:[],fields:[],widgets:[]}
 if(command==='preview_pdf_metadata_copy'){
  if(!window.pdfAudit.metadataRecovery)throw Error('测试场景：属性读取失败，请重试')
  return {status:'blocked',existingValues:{title:'磁盘原始标题',author:'',subject:'',keywords:''},blockers:['xmp_packet_present_write_unverified'],updatedFields:[],removedFields:[]}
 }
 if(command==='write_pdf_annotations'||command==='save_config')return
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unmocked PDF audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/pdf-fixture';store.configReady=true;store.theme='white'
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/pdf',component:PdfView},{path:'/library',component:{render:()=>h('div','资料库')}}]})
await router.push('/pdf?path=C:/pdf-fixture/Paper.pdf')
window.pdfAudit={store,router,calls}
document.body.dataset.theme='white'
document.body.dataset.style='minimal'
document.body.style.margin='0'
document.querySelector('#app').style.height='100vh'
createApp({render:()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView)))}).use(pinia).use(router).mount('#app')
