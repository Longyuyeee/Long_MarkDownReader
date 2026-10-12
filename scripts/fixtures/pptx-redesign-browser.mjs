import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NDialogProvider,NMessageProvider} from 'naive-ui'
import PptxReaderView from '/src/views/PptxReaderView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const slides=['产品方向','交付安排'].map((title,i)=>({id:'s'+i,partName:`ppt/slides/slide${i+1}.xml`,title,text:title,notes:i?'下周继续验收。':'先解决用户使用中的问题。',hidden:false,hasBackground:true,backgroundColor:'#ffffff',backgroundSource:'slide',warnings:[],objects:[{id:'o'+i,name:title,kind:'text',text:title,x:80,y:70,width:760,height:180,noFill:true,textStyle:{fontSizeHundredthPoints:2800,color:'#182b49'},groupLevel:0,childCount:0,textRunCount:1,mixedTextStyle:false,flipHorizontal:false,flipVertical:false}]}))
const report={path:'C:/ui/产品方向.pptx',size:2048,modified:1,signature:'fixture',readOnly:false,sourcePreserved:true,media:[],mediaWarnings:[],model:{width:960,height:540,slides,plainText:'产品方向\n交付安排',warnings:[],compatibility:{slideCount:2,textObjectCount:2,imageCount:0,shapeCount:0,groupCount:0,chartCount:0,smartArtCount:0,animationCount:0,notesCount:2,embeddedObjectCount:0,themeCount:1,masterCount:1,unknownPresentationParts:[]}}}
// The native model uses EMU, not CSS pixels.
report.model.width*=9525;report.model.height*=9525
for(const slide of slides)for(const object of slide.objects)for(const key of ['x','y','width','height'])object[key]*=9525
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(['read_pptx_presentation','read_external_pptx_presentation'].includes(command))return structuredClone(report)
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'pptx-audit'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('测试场景：暂时无法完成编辑验证')
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/pptx',component:PptxReaderView}]})
await router.push('/pptx?path=C:/ui/产品方向.pptx')
window.pptxAudit={store,router,calls}
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
createApp({render:()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView)))}).use(pinia).use(router).mount('#app')
