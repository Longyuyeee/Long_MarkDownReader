// Production component; controlled IPC is explicitly not installed evidence.
import {createApp,h,ref,computed} from 'vue'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import AttachmentManagerDialog from '/src/components/AttachmentManagerDialog.vue'
import {resolveThemeName,getThemeTone,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
const root=ref('C:/library'),context=ref('C:/library:note.md'),style=ref('minimal'),theme=ref('white'),manager=ref(null)
const state=window.attachmentAudit={calls:[],draft:'需要保留的草稿\n![图](images/a.png)\n',disk:'磁盘原文',fail:false,cancel:false,hold:false,pending:[],opened:[],appearance(s,t='white'){style.value=s;theme.value=t;document.body.dataset.style=s;document.body.dataset.theme=resolveThemeName(t,false);document.body.classList.toggle('is-dark',isDarkTheme(t,false))},switch(){context.value='different'},release(){this.hold=false;for(const done of this.pending.splice(0))done()}}
window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
 state.calls.push({command,args});if(state.fail)throw Error('目录暂时无法读取')
 if(command==='inspect_library_attachments'){const result={document:'C:/library/note.md',markdown:true,references:[{target:state.draft.includes('new.png')?'images/new.png':'images/a.png',path:'C:/library/images/a.png',status:'resolved_file',line:2,count:1,canReplace:true},{target:'images/missing.png',path:'C:/library/images/missing.png',status:'missing',line:3,count:1,canReplace:true},{target:'[[旧引用]]',path:null,status:'unsupported',line:4,count:1,canReplace:false}]};if(state.hold)await new Promise(resolve=>state.pending.push(resolve));return result}
 if(command==='pick_library_attachment')return state.cancel?null:{path:'C:/library/images/new.png',imported:false,note:''}
 if(command==='preview_attachment_reference')return{content:args.content.replace(args.oldTarget,'images/new.png'),count:1,target:'images/new.png'}
 if(command==='list_library_attachment_uses')return[{document:'C:/library/引用笔记.md',line:9,count:1}]
 if(command==='plugin:opener|reveal_item_in_dir')return
 throw Error('Unexpected attachment fixture command '+command)
}}
state.appearance('minimal')
const tone=computed(()=>getThemeTone(theme.value,false).ui),overrides=computed(()=>({common:{primaryColor:tone.value.primary,textColor1:tone.value.text,textColor2:tone.value.text+'c7',borderColor:tone.value.text+'26',cardColor:tone.value.surface,modalColor:tone.value.surface,popoverColor:tone.value.surface,bodyColor:'transparent',borderRadius:VISUAL_STYLE_RADII[style.value].normal}}))
createApp({setup(){return()=>h(NConfigProvider,{theme:isDarkTheme(theme.value,false)?darkTheme:null,themeOverrides:overrides.value},{default:()=>h(NDialogProvider,{}, {default:()=>h(NMessageProvider,{}, {default:()=>h('main',{style:'height:100vh;padding:30px;box-sizing:border-box;background:var(--theme-bg);color:var(--theme-text)'},[
 h('button',{onClick:()=>manager.value.open('C:/library/note.md')},'管理附件…'),h(AttachmentManagerDialog,{ref:manager,libraryRoot:root.value,contextKey:context.value,captureDraft:()=>state.draft,applyDraft:(_path,expected,content)=>{if(expected!==state.draft)throw Error('正文已有新的修改');state.draft=content},onOpen:path=>state.opened.push(path)})
 ])})})})}}).mount('#app')
