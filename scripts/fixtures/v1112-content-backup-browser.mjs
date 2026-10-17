// Real SettingsView and ContentBackupDialog. Explicitly SIMULATED IPC, not disk proof.
import {createApp,h,computed,watch} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import * as naive from 'naive-ui'
import SettingsView from '/src/views/SettingsView.vue'
import {useAppStore} from '/src/store/app.ts'
import {getThemeTone,resolveThemeName,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import {registerNaiveComponents} from '/src/services/naiveComponents.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import '/src/styles/display-preferences.scss'
import '/src/styles/workflow-surfaces.scss'
document.body.style.setProperty('--ease-premium','cubic-bezier(0.16, 1, 0.3, 1)')
const pinia=createPinia(),store=useAppStore(pinia),calls=[],pending=[],plans=new Map();let seq=0
const audit=window.contentBackupAudit={calls,pending,plans,store,dialogs:[],deferNext:'',failNext:null,autoCancel:true,targetFailure:'',resolve:i=>pending[i].resolve(pending[i].result()),reject:i=>pending[i].reject(Error('已取消；未发布内容包或恢复目录'))}
const summary=(id,options={documents:true,attachments:true,annotations:true,history:true,directory:''},restore=false)=>({planId:id,libraryName:'项目资料',createdAt:1800000000,totalBytes:19300000,entryCount:Object.entries({documents:24,attachments:8,annotations:2,history:22}).reduce((n,[key,count])=>n+(options[key]?count:0),0),counts:Object.fromEntries(Object.entries({documents:24,attachments:8,annotations:2,history:22}).map(([key,count])=>[key,options[key]?count:0])),entries:[{path:'files/会议/会议记录.md',relativePath:'会议/会议记录.md',category:'documents',bytes:2400,sha256:'a'.repeat(64),modifiedNanos:1800000000000000000,sourceRelative:null},{path:'files/图片/流程图.png',relativePath:'图片/流程图.png',category:'attachments',bytes:9000,sha256:'b'.repeat(64),modifiedNanos:1800000000000000000,sourceRelative:null}],previewTruncated:false,excludedCount:2,excluded:[{path:'.git',reason:'隐藏或版本目录，未包含'},{path:'.env',reason:'敏感配置，未包含'}],boundary:['未保存草稿','应用配置与系统凭据','所选范围外链接目标'],sha256:restore?'d'.repeat(64):null,maxTotalBytes:512*1024*1024,maxFileBytes:128*1024*1024,scopeDirectory:options.directory})
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args={})=>{
 // Match the real JSON IPC serialization boundary, including reactive config objects.
 calls.push({command,args:JSON.parse(JSON.stringify(args))})
 if(audit.failNext?.command===command){const error=audit.failNext.error;audit.failNext=null;throw Error(error)}
 const result=()=>{
  if(command==='preview_content_backup'){const id='export-'+ ++seq,value=summary(id,args.options);plans.set(id,value);return value}
  if(command==='preflight_content_restore'){const id='restore-'+ ++seq,value=summary(id,undefined,true);plans.set(id,value);return value}
  if(command==='check_content_restore_target'){if(audit.targetFailure)throw Error(audit.targetFailure);return {path:args.targetDirectory,availableBytes:1024**3,requiredBytes:36*1024**2,historyCount:22}}
  if(command==='export_content_backup'||command==='restore_content_backup'){const plan=plans.get(args.planId);if(!plan)throw Error('预检过期');return {path:args.targetPath||args.targetDirectory,sha256:'e'.repeat(64),bytes:19300000,entryCount:plan.entryCount,historyCount:plan.counts.history,status:'completed',sourceUnchanged:true}}
  if(command==='discard_content_backup_plan'){plans.delete(args.planId);return}
  if(command==='cancel_content_backup'){if(!audit.autoCancel)return false;const work=pending.find(p=>p.args.operationId===args.operationId&&!p.settled);if(work){work.settled=true;work.reject(Error('已取消；未发布内容包或恢复目录'));return true}return false}
  if(command==='plugin:dialog|open'||command==='plugin:dialog|save')return audit.dialogs.shift()??null
  if(command==='prepare_library_path')return args.path
  if(command==='save_config'||command==='report_window_draft_session')return
  if(command==='register_window_draft_session')return 'content-backup-ui'
  if(command==='plugin:app|version')return '1.1.11'
  if(command==='check_community_update')return {available:false,currentVersion:'1.1.11',latestVersion:'1.1.11',releaseNotes:'',releaseUrl:''}
  if(command==='get_all_tags'||command==='discover_external_applications')return []
  if(command==='plugin:event|listen')return 1
  if(command.startsWith('plugin:event|'))return
  throw Error('Unexpected content backup UI fixture IPC: '+command)
 }
 if(audit.deferNext===command){audit.deferNext='';return new Promise((resolve,reject)=>pending.push({command,args,result,resolve,reject,settled:false}))}
 return result()
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/backup-lib';store.libraries=[{name:'项目资料',path:'C:/backup-lib'}];store.configReady=true;store.loadConfig=async()=>{};store.motionSpeed='normal'
store.motionSpeed='calm'
store.tabs=[{id:'dirty-draft',path:'C:/backup-lib/未保存.md',title:'未保存草稿',content:'不能改变的当前草稿',isDirty:true}]
audit.initialTabs=JSON.stringify(store.tabs)
const systemDark=matchMedia('(prefers-color-scheme: dark)').matches
watch(()=>store.theme,value=>{document.body.dataset.theme=resolveThemeName(value,systemDark);document.body.classList.toggle('is-dark',isDarkTheme(value,systemDark))},{immediate:true})
watch(()=>store.visualStyle,value=>document.body.dataset.style=value,{immediate:true})
watch(()=>store.motionSpeed,value=>document.body.dataset.motion=value,{immediate:true})
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/settings',name:'Settings',component:SettingsView},{path:'/else',component:{render:()=>h('div','其他页面')}}]});await router.push('/settings?category=privacy');audit.router=router
const overrides=computed(()=>{const tone=getThemeTone(store.theme,systemDark).ui,radius=VISUAL_STYLE_RADII[store.visualStyle]||VISUAL_STYLE_RADII.soft;return {common:{primaryColor:tone.primary,primaryColorHover:tone.primary,primaryColorPressed:tone.primary,textColor1:tone.text,textColor2:tone.text+'c7',textColor3:tone.text+'8f',borderColor:tone.text+'26',cardColor:tone.surface,modalColor:tone.surface,popoverColor:tone.surface,bodyColor:'transparent',borderRadius:radius.normal,borderRadiusSmall:radius.small}}})
document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(naive.NConfigProvider,{theme:isDarkTheme(store.theme,systemDark)?naive.darkTheme:null,themeOverrides:overrides.value},()=>h(naive.NDialogProvider,{},()=>h(naive.NMessageProvider,{},()=>h(RouterView))))});registerNaiveComponents(app);app.use(pinia).use(router).mount('#app');audit.unmount=()=>app.unmount()
