import {createApp,h} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import MediaViewerView from '/src/views/MediaViewerView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),calls=[]
const videoFixture=new URLSearchParams(location.search).has('video')
let assetUrl='/icon.png'
if(videoFixture){
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180
 const context=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[]
 const recorder=new MediaRecorder(stream,{mimeType:'video/webm'})
 recorder.ondataavailable=event=>chunks.push(event.data)
 const stopped=new Promise(resolve=>recorder.onstop=resolve)
 let frame=0
 const draw=()=>{context.fillStyle='#182334';context.fillRect(0,0,320,180);context.fillStyle='#a7c9ff';context.font='22px sans-serif';context.fillText('Review clip '+frame++,30,95)}
 draw();recorder.start();const timer=setInterval(draw,100)
 await new Promise(resolve=>setTimeout(resolve,1500));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop())
 assetUrl=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}))
}
window.mediaAudit={calls}
window.__TAURI_INTERNALS__={convertFileSrc:()=>assetUrl,transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(command==='inspect_media_file'&&videoFixture)return {path:'C:/ui/review.webm',formatId:'video',formatLabel:'WebM',kind:'video',mimeType:'video/webm',size:1000,modified:0,readOnly:true,extension:'webm',playbackSupport:'webview-native',streaming:false}
 if(command==='discover_video_subtitles')return []
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
await router.push(videoFixture?'/media?path=C:/ui/review.webm':'/media?path=C:/ui/icon.png')
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView)))})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
