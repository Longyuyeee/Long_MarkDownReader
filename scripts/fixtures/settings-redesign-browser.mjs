import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import SettingsView from '/src/views/SettingsView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
// Settings uses the application-shell easing token; preserve it in this isolated view.
document.body.style.setProperty('--ease-premium','cubic-bezier(0.16, 1, 0.3, 1)')
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.settingsAudit={calls}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='plugin:app|version')return '1.0.26'
 if(command==='check_community_update')return {available:false,currentVersion:'1.0.26',latestVersion:'1.0.26',releaseNotes:'',releaseUrl:''}
 if(command==='get_all_tags'||command==='discover_external_applications')return []
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'opml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected Settings audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true;store.loadConfig=async()=>{}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/settings',name:'Settings',component:SettingsView}]})
await router.push('/settings')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.cssText='height:100vh;width:520px'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
