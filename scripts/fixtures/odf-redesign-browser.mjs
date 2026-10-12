import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NDialogProvider,NMessageProvider} from 'naive-ui'
import OdfContentReaderView from '/src/views/OdfContentReaderView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(['read_odf_content_document','read_external_odf_content_document'].includes(command))return {
  path:args.path,size:2048,signature:'fixture',readOnly:false,sourcePreserved:true,
  editInventory:{status:'candidate',sourceDigest:'fixture',editableCells:[{id:'a1',sheetName:'计划',address:'A1',text:'待办',valueType:'string',expectedValueDigest:'fixture',currentStyleName:'',expectedStyleDigest:'fixture'}],blockedCells:[],namedCellStyles:[],blockers:[],writesUserFile:false},
  odpEditInventory:{status:'candidate',sourceDigest:'fixture',editableTargets:[{id:'p1',slideIndex:1,slideName:'项目概览',paragraphIndex:1,text:'项目概览',expectedTextDigest:'fixture'}],blockedSlides:[],blockers:[],writesUserFile:false},
  model:{format:args.path.endsWith('.ods')?'ods':'odp',sheets:[{id:'sheet1',name:'计划',rows:[{row:1,cells:[{address:'A1',column:1,text:'待办',valueType:'string'},{address:'B1',column:2,text:'2',formula:'of:=1+1'}]}],formulaCount:1}],slides:[{id:'slide1',index:1,name:'项目概览',text:'项目概览\n先解决用户的问题。',notes:'不要覆盖原文件。',imageCount:0},{id:'slide2',index:2,name:'交付计划',text:'交付计划',notes:'继续验收。',imageCount:0}],formulaCount:1,warnings:[],package:{manifestVersion:'1.3',entryCount:5,risks:{riskCodes:[],externalLinkCount:0,embeddedObjectCount:0,scriptMarkerCount:0,signaturePartCount:0}}}}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'odf-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected ODF UI IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/odf',component:OdfContentReaderView}]})
await router.push('/odf?path=C:/ui/计划.'+(new URLSearchParams(location.search).get('format')||'ods'))
window.odfAudit={router,calls}
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
createApp({render:()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView)))}).use(pinia).use(router).mount('#app')
