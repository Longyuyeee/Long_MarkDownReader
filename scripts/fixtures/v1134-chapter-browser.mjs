// Production right-click component; controlled document/clipboard, no native claims.
import {createApp,h,ref,computed} from 'vue'
import {NConfigProvider,NDialogProvider,NMessageProvider,darkTheme} from 'naive-ui'
import MarkdownSectionActions from '/src/components/MarkdownSectionActions.vue'
import {markdownSections} from '/src/utils/markdownSections.ts'
import {resolveThemeName,getThemeTone,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
const style=ref('minimal'),theme=ref('white'),root=ref('C:/资料库'),actions=ref(null),draft=ref('# 方案\n\n## 重复\n\n第一章\n\n## 重复\n\n自己的补写\n'),clipboard=[]
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{clipboard.push(text)}}})
window.chapterAudit={clipboard,get draft(){return draft.value},append(){draft.value+='新的未保存内容\n'},root(value){root.value=value},appearance(s,t='white'){style.value=s;theme.value=t;document.body.dataset.style=s;document.body.dataset.theme=resolveThemeName(t,false);document.body.classList.toggle('is-dark',isDarkTheme(t,false))}}
window.chapterAudit.appearance('minimal')
const capture=id=>{const model=markdownSections(draft.value);if(!model.sections.some(s=>s.id===id))throw Error('标题已经变化');return {path:root.value+'/方案 #%.md',libraryRoot:root.value,model,id,owner:'controlled fixture'}}
const tone=computed(()=>getThemeTone(theme.value,false).ui),overrides=computed(()=>({common:{primaryColor:tone.value.primary,textColor1:tone.value.text,textColor2:tone.value.text+'c7',borderColor:tone.value.text+'26',cardColor:tone.value.surface,modalColor:tone.value.surface,popoverColor:tone.value.surface,bodyColor:'transparent',borderRadius:VISUAL_STYLE_RADII[style.value].normal}}))
createApp({setup(){return()=>h(NConfigProvider,{theme:isDarkTheme(theme.value,false)?darkTheme:null,themeOverrides:overrides.value},{default:()=>h(NDialogProvider,{}, {default:()=>h(NMessageProvider,{}, {default:()=>h('main',{style:'height:100vh;padding:30px;box-sizing:border-box;background:var(--theme-bg);color:var(--theme-text)'},[
 h('p','原文和自己的补写保持不变'),h('button',{onContextmenu:event=>{event.preventDefault();actions.value.open(event,markdownSections(draft.value).sections[2].id)}},'第二个重复标题'),h('pre',{style:'white-space:pre-wrap'},draft.value),
 h(MarkdownSectionActions,{ref:actions,contextKey:root.value,capture,applyChange:()=>{throw Error('This fixture only copies links')}})
 ])})})})}}).mount('#app')
