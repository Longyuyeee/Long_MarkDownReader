import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NMessageProvider} from 'naive-ui'
import ExternalOfficeView from '/src/views/ExternalOfficeView.vue'
import LegacyOfficeView from '/src/views/LegacyOfficeView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.officeAudit={calls,fail:false,blocked:false}
window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='discover_external_applications')return [{id:'wps',label:'WPS Office',available:false,supportedExtensions:['.wps','.doc']}]
 if(command==='open_workspace_file_externally')throw Error('测试场景：没有可用的系统关联')
 if(command.startsWith('inspect_')||command.startsWith('preflight_')){
  if(window.officeAudit.fail)throw Error('测试场景：文件暂时不可读')
  return {path:args.path,formatId:'doc',formatLabel:args.path.endsWith('.wps')?'WPS 文档':'Word 97–2003',extension:args.path.endsWith('.wps')?'.wps':'.doc',targetExtension:'.docx',size:4096,modified:1,sha256:'a'.repeat(64),containerKind:'OLE',cfbVersion:'3',streamCount:4,itemCount:2,formulaCount:0,warnings:[],riskCodes:window.officeAudit.blocked?['encrypted-content']:['none-detected'],blockReasons:window.officeAudit.blocked?['测试场景：加密文件禁止转换']:[],conversionEligible:!window.officeAudit.blocked,readOnly:true,sourcePreserved:true}
 }
 if(command.startsWith('convert_'))throw Error('测试场景：转换器不可用，源文件未修改')
 if(command==='save_config')return
 throw Error('Unexpected Office UI IPC: '+command)
}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/external',component:ExternalOfficeView},{path:'/legacy',component:LegacyOfficeView}]})
const legacy=new URLSearchParams(location.search).has('legacy')
await router.push(legacy?'/legacy?path=C:/ui/项目报告.doc':'/external?path=C:/ui/项目报告.wps')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
createApp({render:()=>h(NMessageProvider,{},()=>h(RouterView))}).use(pinia).use(router).mount('#app')
