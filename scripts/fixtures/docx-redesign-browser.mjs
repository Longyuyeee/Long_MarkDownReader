import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { NDialogProvider, NMessageProvider, NButton, NSpin } from 'naive-ui'
import DocxReaderView from '/src/views/DocxReaderView.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(), store=useAppStore(pinia), calls=[]
const blocks=[['heading','项目计划',1],['paragraph','先确定用户需要，再改进编辑体验。'],['heading','交付安排',2],['paragraph','保留所有工具和未保存的内容。']].map(([kind,text,level],i)=>({id:'b'+i,kind,text,level,rows:[],imageCount:0,imageParts:[],relatedContentIds:[]}))
const report={path:'C:/ui/项目计划.docx',size:2048,modified:1,signature:'fixture',documentPartDigest:'fixture',readOnly:false,sourcePreserved:true,
 editableTextTargets:blocks.map(b=>({id:'t'+b.id,blockId:b.id,kind:b.kind,carrier:'plain',text:b.text,expectedTextDigest:'fixture',rowIndex:null,columnIndex:null})),
 editableStyleTargets:[],editableParagraphStyleTargets:[],paragraphStyleOptions:[],editableImageTargets:[],media:[],mediaWarnings:[],
 model:{blocks,headings:blocks.filter(b=>b.kind==='heading').map(b=>({blockId:b.id,text:b.text,level:b.level})),relatedContent:[{id:'note',kind:'footnote',label:'脚注 1',text:'验收范围说明。',sourcePart:'word/footnotes.xml',anchorBlockIds:['b1']}],sections:[],plainText:blocks.map(b=>b.text).join('\n'),warnings:[],compatibility:{producer:'测试夹具',paragraphCount:4,headingCount:2,listItemCount:0,tableCount:0,imageCount:0,renderableImageCount:0,styleCount:1,numberingDefinitionCount:0,mergedCellCount:0,pageBreakCount:0,renderedPageBreakCount:0,sectionCount:1,headerCount:0,footerCount:0,footnotes:true,unknownWordParts:[]}}}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 calls.push({command,args})
 if(['read_docx_document','read_external_docx_document'].includes(command))return structuredClone(report)
 if(command==='save_config')return
 if(command==='plugin:event|listen')return 1
 if(command.startsWith('plugin:event|'))return
 throw Error('测试中不允许真实写入：'+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/docx',component:DocxReaderView}]})
await router.push('/docx?path=C:/ui/项目计划.docx')
window.docxAudit={store,router,calls}
document.body.dataset.theme='white';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView)))})
app.component('n-button',NButton).component('n-spin',NSpin).use(pinia).use(router).mount('#app')
