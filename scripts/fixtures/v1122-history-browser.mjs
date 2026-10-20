// Actual production file-operation components; controlled IPC, not native evidence.
import {createApp,h,ref,computed} from 'vue'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import FileOperationHistoryDialog from '/src/components/FileOperationHistoryDialog.vue'
import {fileOperationBusy} from '/src/services/libraryFileOperations.ts'
import {pendingDocumentSaves} from '/src/services/windowDrafts.ts'
import {resolveThemeName,getThemeTone,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'

const root=ref('C:/source'),style=ref('minimal'),theme=ref('white'),operations=ref(null)
const records=[{id:'move-a',time:Date.now(),action:'move',oldPath:'C:/source/笔记.md',newPath:'C:/source/项目/笔记.md',targetRoot:'C:/source',status:'completed',recoveryId:'links-a',note:'',canRestore:true},{id:'copy-b',time:Date.now()-1000,action:'copy',oldPath:'C:/source/参考.txt',newPath:'C:/other/参考.txt',targetRoot:'C:/other',status:'completed',recoveryId:null,note:'',canRestore:false},{id:'pending-c',time:Date.now()-2000,action:'move',oldPath:'C:/source/旧.md',newPath:'C:/source/新.md',targetRoot:'C:/source',status:'needsReview',recoveryId:'links-c',note:'请核对实际位置，不会自动重做',canRestore:false}]
const state=window.historyAudit={calls:[],before:[],after:[],draft:'未保存正文',deny:false,conflict:false,hold:false,pending:[],reviews:[],appearance(s,t='white'){style.value=s;theme.value=t;document.body.dataset.style=s;document.body.dataset.theme=resolveThemeName(t,false);document.body.classList.toggle('is-dark',isDarkTheme(t,false))},source(value){root.value=value},release(){this.hold=false;for(const done of this.pending.splice(0))done()}}
window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{state.calls.push({command,args});if(command==='list_library_file_operations'){const result=structuredClone(records);if(state.hold)await new Promise(resolve=>state.pending.push(resolve));return result}if(command==='restore_library_file_operation'){if(state.conflict)throw Error('文件已有后续修改，已保留现状');const r=records.find(r=>r.id===args.operationId);r.status='restored';r.canRestore=false;return{items:[{oldPath:r.newPath,newPath:r.oldPath}],errors:[]}}if(command==='clear_library_file_operations'){for(let n=records.length-1;n>=0;n--)if(records[n].status!=='needsReview')records.splice(n,1);return}if(command==='locate_library_file_operation')return records.find(r=>r.id===args.operationId).newPath;if(command==='plugin:opener|reveal_item_in_dir')return;throw Error('Unexpected history fixture command '+command)}}
state.appearance('minimal')
const tone=computed(()=>getThemeTone(theme.value,false).ui),overrides=computed(()=>({common:{primaryColor:tone.value.primary,textColor1:tone.value.text,textColor2:tone.value.text+'c7',borderColor:tone.value.text+'26',cardColor:tone.value.surface,modalColor:tone.value.surface,popoverColor:tone.value.surface,bodyColor:'transparent',borderRadius:VISUAL_STYLE_RADII[style.value].normal}}))
createApp({setup(){return()=>h(NConfigProvider,{theme:isDarkTheme(theme.value,false)?darkTheme:null,themeOverrides:overrides.value},{default:()=>h(NDialogProvider,{}, {default:()=>h(NMessageProvider,{}, {default:()=>h('main',{style:'height:100vh;padding:30px;box-sizing:border-box;background:var(--theme-bg);color:var(--theme-text)'},[
 h('p','原窗口草稿：'+state.draft),h('button',{onClick:()=>operations.value.open()},'最近操作…'),h(FileOperationHistoryDialog,{ref:operations,libraryRoot:root.value,beforeOperate:async(paths,operation)=>{state.before.push({paths,operation});return !state.deny},afterOperate:async(result,operation)=>state.after.push({result,operation}),onReview:id=>state.reviews.push(id)})
 ])})})})}}).mount('#app')
