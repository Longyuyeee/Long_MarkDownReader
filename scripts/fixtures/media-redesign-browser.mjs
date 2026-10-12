import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import MediaViewerView from '/src/views/MediaViewerView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
window.mediaAudit={calls}
window.__TAURI_INTERNALS__={convertFileSrc:()=>"/icon.png",transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='inspect_media_file')return {path:'C:/ui/icon.png',formatId:'raster-image',formatLabel:'PNG',kind:'image',mimeType:'image/png',size:1000,modified:0,readOnly:true,extension:'png',playbackSupport:'native-image',streaming:false}
 if(command==='inspect_image_edit_source')return {path:'C:/ui/icon.png',sourceDigest:'fixture',width:512,height:512,editableExtensions:['png','jpg','webp','bmp'],maxEdge:8192,saveMode:'copy-only'}
 if(command==='save_config'||command==='report_window_draft_session')return
 if(command==='register_window_draft_session')return 'opml-ui'
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected Media audit IPC: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/media',component:MediaViewerView}]})
await router.push('/media?path=C:/ui/icon.png')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
for(const [name,component]of Object.entries(naive))if(/^N[A-Z]/.test(name))app.component(name,component)
app.use(pinia).use(router).mount('#app')
