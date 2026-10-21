// Production palette and registry; controlled callbacks are not installed evidence.
import {createApp,h,reactive,ref} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory} from 'vue-router'
import * as naive from 'naive-ui'
import CommandPalette from '/src/components/CommandPalette.vue'
import {useContextCommands} from '/src/services/contextCommands.ts'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
const state=window.commandAudit=reactive({path:'a.md',ready:true,calls:0,draft:'未保存的正文',style:'minimal'})
window.__TAURI_INTERNALS__={invoke:async()=>[]}
const pinia=createPinia(),store=useAppStore(pinia);store.libraryPath='C:/commands';store.recentFiles=[]
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div/>'}}]});await router.push('/')
const app=createApp({setup(){const show=ref(false);useContextCommands(()=>state.path,()=>state.ready?[{id:'attachment',title:'管理附件…',description:'查看当前笔记附件和引用位置',keywords:'图片 附件 引用',run:()=>state.calls++}]:[])
 return()=>h(naive.NConfigProvider,{}, {default:()=>h('main',{'data-style':state.style,'data-theme':'white',style:'height:100vh;background:var(--theme-bg);color:var(--theme-text)'},[
  h('textarea',{'aria-label':'正文',value:state.draft,onInput:e=>state.draft=e.target.value}),h('button',{onClick:()=>show.value=true},'命令'),h(CommandPalette,{show:show.value,onClose:()=>show.value=false})
 ])})}})
app.use(pinia).use(router);for(const name of ['NInput','NIcon','NButton','NSelect'])app.component(name,naive[name]);app.mount('#app')
