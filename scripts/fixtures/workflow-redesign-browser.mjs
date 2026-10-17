import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as naive from 'naive-ui'
import App from '/src/App.vue'
import WorkspaceHome from '/src/views/WorkspaceHome.vue'
import InboxView from '/src/views/InboxView.vue'
import LibraryMode from '/src/views/LibraryMode.vue'
import QuickNote from '/src/views/QuickNote.vue'
import { useAppStore } from '/src/store/app.ts'
import { themePresets } from '/src/config/themePresets.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import '/src/styles/vditor-content-themes.scss'
import '/src/styles/display-preferences.scss'
import '/src/styles/workflow-surfaces.scss'

const root = 'C:/workflow-fixture', pinia = createPinia(), store = useAppStore(pinia)
const disk = new Map([
  [root+'/项目方案.md', '# 项目方案\n\n让阅读、记录和继续工作更顺手。\n\n## 下一步\n\n- [ ] 整理项目需求\n'],
  [root+'/会议记录.md', '# 会议记录\n\n先确定保存的位置，再开始记录。\n'],
  [root+'/Inbox/灵感.md', '# 灵感\n\n保留功能，让常用操作容易找到。\n'],
  [root+'/Inbox/参考资料/调研.md', '# 调研\n\n用于资料对照。\n'],
])
const directories = [root+'/Inbox',root+'/Inbox/参考资料']
const tasks = [
  {title:'项目方案.md',path:root+'/项目方案.md',relativePath:'项目方案.md',line:7,text:'整理项目需求',signature:'fixture-1',completed:false,priority:'high',dueDate:'2026-10-12',sourceType:'markdown'},
  {title:'会议记录.md',path:root+'/会议记录.md',relativePath:'会议记录.md',line:3,text:'补充会议结论',signature:'fixture-1',completed:false,priority:'normal',dueDate:null,sourceType:'markdown'},
]
window.workflowAudit = {calls:[],store,disk,directories,presets:themePresets,failCapture:false,failInbox:false,failConfig:false}
const snapshot = path => ({path,content:disk.get(path),encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true,signature:disk.get(path),contentDigest:disk.get(path),size:disk.get(path)?.length||0,modified:1})
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener:()=>{} }
window.__TAURI_INTERNALS__ = {
 metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>1,
 invoke:async(command,args={})=>{
  window.workflowAudit.calls.push({command,args})
  if(command==='plugin:event|listen')return 1
  if(command.startsWith('plugin:event|')||command.startsWith('plugin:window|'))return
  if(command==='plugin:app|version')return '1.0.26'
  if(command==='register_window_draft_session')return 'workflow-fixture'
  if(command==='report_window_draft_session'||command==='open_quick_note')return
  if(command==='check_community_update')return {available:false,currentVersion:'1.0.26',latestVersion:'1.0.26',releaseNotes:'',releaseUrl:'',publishedAt:null,installerName:'',installerSize:0,installerSha256:''}
  if(command==='save_config'){if(window.workflowAudit.failConfig)throw Error('模拟配置失败');return}
  if(command==='get_workspace_overview')return {totalFiles:disk.size,tasks:tasks.filter(t=>!t.completed),completedTasks:tasks.filter(t=>t.completed),recentFiles:[...disk.keys()].slice(0,2).map(path=>({title:path.split('/').pop(),path,relativePath:path.slice(root.length+1),objectType:'markdown',modifiedAt:Math.floor(Date.now()/1000),size:100})),canvases:[],formatCounts:[{objectType:'markdown',count:4}]}
  if(command==='set_workspace_markdown_task_state'){const task=tasks.find(t=>t.path===args.mutation.path);Object.assign(task,args.mutation);return {...task}}
  if(command==='get_knowledge_index_status')return {state:'ready',schemaVersion:1,sourceCount:4,objectCount:4,relationCount:0,progress:100,cacheBytes:0,recoveryAvailable:false}
  if(command==='analyze_graph_health')return {brokenLinks:[],ambiguousLinks:[],orphanNotes:[],scannedNotes:4}
  if(command==='analyze_workspace_health')return {duplicateGroups:[],unreferencedAnnotations:[],scannedFiles:4,hashedFiles:4,scannedAnnotations:0,truncated:false}
  if(command==='get_folder_order')return {items:[],pinned:[]}
  if(command==='get_library_stats')return {file_count:4,total_words:100}
  if(command==='read_inbox_directory'){
   if(window.workflowAudit.failInbox)throw Error('模拟目录不可读 (os error 5)')
   const base=root+'/'+(args.inboxDirectory||'Inbox')
   if(args.path===base&&!directories.includes(base))return {entries:[],directoryMissing:true}
   if(!directories.includes(args.path))throw Error('模拟子目录已移动 (os error 2)')
   return {entries:[...directories.map(path=>({path,name:path.split('/').pop(),is_dir:true})),...[...disk.keys()].map(path=>({path,name:path.split('/').pop(),is_dir:false}))].filter(entry=>entry.path.slice(0,entry.path.lastIndexOf('/'))===args.path),directoryMissing:false}
  }
  if(command==='create_inbox_directory'){
   if(window.workflowAudit.failInbox)throw Error('模拟目录不可写 (os error 5)')
   const path=args.libraryRoot+'/'+(args.inboxDirectory||'Inbox')
   if(!directories.includes(path))directories.push(path)
   return path
  }
  if(command==='create_new_file'){
   let count=0,path
   do{path=(args.targetDir||args.libraryRoot)+`/未命名${count?` ${count}`:''}.md`;count++}while(disk.has(path))
   disk.set(path,'');return path
  }
  if(command==='validate_inbox_location')return args.path.slice(args.libraryRoot.length+1)||'.'
  if(command==='scan_directory'){
   if(window.workflowAudit.failInbox&&args.path.includes('/Inbox'))throw Error('模拟目录不可读')
   return [...directories.map(path=>({path,name:path.split('/').pop(),is_dir:true})),...[...disk.keys()].map(path=>({path,name:path.split('/').pop(),is_dir:false}))].filter(entry=>entry.path.slice(0,entry.path.lastIndexOf('/'))===args.path)
  }
  if(command==='read_text_document')return snapshot(args.path)
  if(command==='write_text_document'){disk.set(args.path,args.content);return snapshot(args.path)}
  if(command==='search_smart_collection')return {results:[{title:'项目方案.md',path:root+'/项目方案.md',objectType:'markdown',matchKind:'body',context:'让阅读、记录和继续工作更顺手。',score:100,extractionFailed:false}],truncated:false}
  // Browser-only compatibility adapter for historical fixtures. Native and
  // installed tests call the actual paged commands, never this adapter.
  if(command==='get_tag_catalog_page'){const tags=await window.__TAURI_INTERNALS__.invoke('get_all_tags',{libraryRoot:args.request.libraryRoot});return {sessionId:'fixture-tags',tags,nextCursor:null,scanState:'ready',scanComplete:true,examinedNotes:Math.max(0,...tags.map(tag=>tag.count)),totalNotes:Math.max(0,...tags.map(tag=>tag.count)),unreadSources:0,warnings:[]}}
  if(command==='close_knowledge_search')return true
  if(command==='search_collection_page'){
   const request=args.request,response=await window.__TAURI_INTERNALS__.invoke('search_smart_collection',{libraryRoot:request.libraryRoot,query:request.query,objectTypes:request.objectTypes,filters:request.filters})
   const groups=new Map();for(const match of response.results){if(!groups.has(match.path))groups.set(match.path,{path:match.path,title:match.title,matches:[],mayHaveMoreMatches:false,locationLimitPerKind:5,unlocatedLimitPerKind:1});groups.get(match.path).matches.push(match)}
   const files=[...groups.values()].sort((a,b)=>(request.sort==='path'?a.path:a.title).localeCompare(request.sort==='path'?b.path:b.title)),offset=Number(request.cursor?.split(':').at(-1)||0),end=offset+request.pageSize
   return {sessionId:'fixture-collection',snapshotId:'fixture-collection',files:files.slice(offset,end),pageOffset:offset,nextCursor:end<files.length?'fixture:p:'+end:null,scanState:response.truncated?'limited':'ready',scanComplete:!response.truncated,totalFiles:response.truncated?null:files.length,warnings:[]}
  }
  if(command==='search_knowledge')return [{title:'会议记录.md',path:root+'/会议记录.md',objectType:'markdown',matchKind:'body',context:'先确定保存的位置，再开始记录。',score:100,extractionFailed:false}]
  if(command==='preview_search_document')return {text:disk.get(args.path),label:'Markdown',truncated:false,matchFound:true}
  if(command==='plugin:dialog|open')return root+'/Inbox/参考资料'
  if(command==='save_quick_note'){if(window.workflowAudit.failCapture){window.workflowAudit.failCapture=false;throw Error('模拟保存失败')}const path=args.targetDir+'/快速笔记.md';disk.set(path,args.content);return path}
  if(['get_all_tags','discover_external_applications','summarize_graph_relations','find_backlinks','extract_wikilinks','list_history'].includes(command))return []
  throw Error('Unexpected workflow fixture IPC: '+command)
 }
}
store.activeLibraryPath=root;store.libraries=[{name:'项目资料库',path:root}];store.configReady=true
store.theme='white';store.visualStyle='minimal';store.motionSpeed='reduced'
store.tabs=[...disk.keys()].slice(0,2).map(path=>({id:path,path,title:path.split('/').pop(),content:disk.get(path),isDirty:false}))
store.activeTabId=store.tabs[0].id
store.starredFiles=[root+'/项目方案.md']
store.recentFiles=[{path:root+'/会议记录.md',title:'会议记录.md'}]
store.loadConfig=async()=>{}
const router=createRouter({history:createMemoryHistory(),routes:[
 {path:'/',name:'WorkspaceHome',component:WorkspaceHome},
 {path:'/inbox',name:'Inbox',component:InboxView},
 {path:'/library',name:'LibraryMode',component:LibraryMode},
 {path:'/quick-note',name:'QuickNote',component:QuickNote},
 {path:'/graph',name:'Graph',component:{template:'<div>图谱入口</div>'}},
 {path:'/settings',name:'Settings',component:{template:'<div>设置入口</div>'}},
]})
await router.push('/')
window.workflowAudit.router=router
const app=createApp(App)
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
document.querySelector('#app').style.height='100vh'
