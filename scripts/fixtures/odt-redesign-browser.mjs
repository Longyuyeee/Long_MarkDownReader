import {createApp} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory} from 'vue-router'
import OdtReaderView from '/src/views/OdtReaderView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const blocks=[['heading','项目说明',1],['paragraph','阅读资料时，目录和正文都应该容易找到。'],['heading','验收安排',2],['paragraph','保留文档原有内容，不自动写入源文件。']].map(([kind,text,level],i)=>({id:'odt'+i,kind,text,level,rows:[],imageParts:[]}))
window.odtAudit={calls,fail:false}
window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='read_odt_document'){
  if(window.odtAudit.fail)throw Error('模拟文件暂时不可读取')
  return {path:args.path,size:2048,signature:'fixture',readOnly:true,sourcePreserved:true,media:[],mediaWarnings:[],model:{blocks,headings:blocks.filter(b=>b.kind==='heading'),plainText:blocks.map(b=>b.text).join('\n'),package:{manifestVersion:'1.3',entryCount:5,uncompressedBytes:4096,risks:{riskCodes:[]}},warnings:[]}}
 }
 if(command==='save_config')return
 throw Error('Unexpected ODT UI IPC: '+command)
}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/odt',component:OdtReaderView}]})
await router.push('/odt?path=C:/ui/项目说明.odt')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
createApp(OdtReaderView).use(pinia).use(router).mount('#app')
