// Actual production file-operation components; controlled IPC, not native evidence.
import {createApp,h,ref,computed} from 'vue'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import LibraryFileOperations from '/src/components/LibraryFileOperations.vue'
import {fileOperationBusy} from '/src/services/libraryFileOperations.ts'
import {pendingDocumentSaves} from '/src/services/windowDrafts.ts'
import {resolveThemeName,getThemeTone,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
const root=ref('C:/source'),style=ref('minimal'),theme=ref('white'),operations=ref(null),plans=new Map(),disk=new Map(),calls=[],pending=[]
let counter=0
const state=window.copyAudit={calls,pending,plans,disk,dirty:'最后未保存的草稿',holdPreview:false,holdExecute:false,loseReply:false,partial:false,warning:false,corrupt:false,deny:false,before:[],after:[],get busy(){return fileOperationBusy.value},get pendingSaves(){return pendingDocumentSaves.value},release(kind){for(const item of pending.filter(item=>item.kind===kind)){pending.splice(pending.indexOf(item),1);item.resolve()}},source(value){root.value=value},appearance(s,t='white'){style.value=s;theme.value=t;document.body.dataset.style=s;document.body.dataset.theme=resolveThemeName(t,false);document.body.classList.toggle('is-dark',isDarkTheme(t,false))}}
const files=['C:/source/研究.pdf','C:/source/阅读笔记.md']
const pause=async kind=>{if(state[kind]){state[kind]=false;await new Promise(resolve=>pending.push({kind,resolve}))}}
window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++counter,invoke:async(command,args={})=>{
 calls.push({command,args:structuredClone(args)})
 if(command==='preview_cross_library_copy'){
  const id='plan-'+ ++counter,items=args.paths.map(path=>({oldPath:path,newPath:args.targetRoot+'/'+(args.targetDir==='.'?'':args.targetDir+'/')+path.split('/').pop(),fileCount:2,dependencyCount:1,totalBytes:1200,warnings:state.warning?['missing.png：引用保持原样']:[],error:state.corrupt&&args.includeReadingResults?'批注无法读取，可取消携带后重试':null,annotationCount:args.includeReadingResults?2:0,readingSourceCount:args.includeReadingResults?1:0,completed:false,reviewRequired:false}));
  const preview={planId:id,sourceRoot:args.sourceRoot,targetRoot:args.targetRoot,targetDirectory:args.targetRoot+'/'+args.targetDir,readingResultsAvailable:true,items};plans.set(id,preview);await pause('holdPreview');return structuredClone(preview)
 }
 if(command==='execute_cross_library_copy'){
  await pause('holdExecute');const preview=plans.get(args.planId);if(!preview)throw Error('预览已失效');
  for(const item of preview.items){if(item.completed||item.error)continue;if(state.partial&&item.oldPath.endsWith('阅读笔记.md')){item.error='来源已变化，请重新核对';continue}item.completed=true;disk.set(item.newPath,'copied saved version')}
  const receipt={preview:structuredClone(preview),result:{items:preview.items.filter(item=>item.completed).map(({oldPath,newPath})=>({oldPath,newPath})),errors:preview.items.filter(item=>!item.completed).map(item=>({path:item.oldPath,message:item.error,disposition:'notExecuted'}))}};
  if(state.loseReply){state.loseReply=false;throw Error('模拟回执丢失')}return receipt
 }
 if(command.startsWith('plugin:'))return null
 throw Error('Unexpected fixture command: '+command)
}}
state.appearance('minimal')
const tone=computed(()=>getThemeTone(theme.value,false).ui),overrides=computed(()=>({common:{primaryColor:tone.value.primary,textColor1:tone.value.text,textColor2:tone.value.text+'c7',borderColor:tone.value.text+'26',cardColor:tone.value.surface,modalColor:tone.value.surface,popoverColor:tone.value.surface,bodyColor:'transparent',borderRadius:VISUAL_STYLE_RADII[style.value].normal}}))
createApp({setup(){return()=>h(NConfigProvider,{theme:isDarkTheme(theme.value,false)?darkTheme:null,themeOverrides:overrides.value},{default:()=>h(NDialogProvider,{}, {default:()=>h(NMessageProvider,{}, {default:()=>h('main',{style:'height:100vh;padding:30px;box-sizing:border-box;background:var(--theme-bg);color:var(--theme-text)'},[
 h('p','原窗口草稿：'+state.dirty),h('button',{onClick:()=>operations.value.openTransfer(files,'copy',root.value)},'复制到…'),
 h(LibraryFileOperations,{ref:operations,libraryRoot:root.value,libraries:[{name:'来源资料库',path:'C:/source'},{name:'项目 B',path:'C:/target'},{name:'项目 C',path:'C:/third'}],beforeOperate:async(paths,operation)=>{state.before.push({paths,operation});return !state.deny},afterOperate:async()=>{},afterCrossCopy:async(result,targetRoot)=>state.after.push({result:structuredClone(result),targetRoot})})
 ])})})})}}).mount('#app')
