import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import XmlEditorView from '/src/views/XmlEditorView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const svg=new URLSearchParams(location.search).has('svg')
const content=svg?'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">\n<rect width="100" height="60" fill="teal"/>\n</svg>':'<project>\n<title>周末计划</title>\n</project>'
window.xmlAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_text_document')return {path:args.path,content,encoding:'utf-8',signature:'fixture',size:100,modified:1}
 if(command==='analyze_xml_source'||command==='analyze_svg_source')return {valid:true,elementCount:2,attributeCount:svg?5:0,namespaceCount:svg?1:0,maxDepth:2,rootName:svg?'svg':'project',commentCount:0,cdataCount:0,processingInstructionCount:0,outlineTruncated:false,diagnostics:[],previewAvailable:svg,sanitizedSvg:svg?content:undefined,outline:[
  {path:svg?'/svg':'/project',name:svg?'svg':'project',depth:0,attributeCount:svg?2:0,start:0,end:content.length,line:1,column:1,preview:'根元素'},
  {path:svg?'/svg/rect':'/project/title',name:svg?'rect':'title',depth:1,attributeCount:svg?3:0,start:content.indexOf('\n')+1,end:content.lastIndexOf('\n'),line:2,column:1,preview:'内容元素'},
 ]}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'xml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected XML audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/xml',component:XmlEditorView}]})
await router.push('/xml?path=C:/ui/项目配置.'+(svg?'svg':'xml'))
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
