// Actual Vue view; native IPC/disk simulated. Never installation evidence.
import {createApp,h,computed,watch} from 'vue'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import {NConfigProvider,NDialogProvider,NMessageProvider,NButton,NSpin,darkTheme} from 'naive-ui'
import {resolveThemeName,isDarkTheme,getThemeTone} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
import DocxReaderView from '/src/views/DocxReaderView.vue'
import {useAppStore} from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
const pinia=createPinia(),store=useAppStore(pinia),clone=value=>JSON.parse(JSON.stringify(value))
const blocks=[['heading','项目计划',1],['paragraph','先确定用户需要，再改进编辑体验。'],['list-item','核对会议安排'],['heading','交付安排',2],['paragraph','保留所有工具和未保存的内容。']].map(([kind,text,level],i)=>({id:'b'+i,kind,text,level,listLevel:0,listKind:'bullet',rows:[],imageCount:0,imageParts:[],relatedContentIds:[]}))
blocks.push({id:'table',kind:'table',text:'事项\t负责人',rows:[{cells:[{text:'事项',columnSpan:1,rowSpan:1,continuation:false},{text:'负责人',columnSpan:1,rowSpan:1,continuation:false}]}],imageCount:0,imageParts:[],relatedContentIds:[]})
blocks.push({id:'complex',kind:'paragraph',text:'复杂域与批注保持只读，不删除。',rows:[],imageCount:0,imageParts:[],relatedContentIds:['note']})
const targets=blocks.filter(b=>b.id!=='complex'&&b.kind!=='table').map(b=>({id:'t'+b.id,blockId:b.id,kind:b.kind,carrier:'plain',text:b.text,expectedTextDigest:'fixture',rowIndex:null,columnIndex:null}))
targets.push(...blocks[5].rows[0].cells.map((c,i)=>({id:'tc'+i,blockId:'table',kind:'table-cell',carrier:'plain',text:c.text,expectedTextDigest:'fixture',rowIndex:0,columnIndex:i})))
const initial={path:'C:/ui/项目计划.docx',size:4096,modified:1,signature:'sig-1',documentPartDigest:'fixture',readOnly:false,sourcePreserved:true,editableTextTargets:targets,editableStyleTargets:targets.map(t=>({...t,bold:false,italic:false,underline:false,fontColor:null,fontSizeHalfPoints:null,expectedStyleDigest:'style-fixture'})),editableParagraphStyleTargets:targets.filter(t=>['paragraph','heading'].includes(t.kind)).map(t=>({...t,currentStyleId:'Normal',expectedParagraphStyleDigest:'paragraph-fixture'})),paragraphStyleOptions:[{id:'Normal',name:'正文'},{id:'Heading1',name:'标题 1'}],editableImageTargets:[],media:[],mediaWarnings:[],model:{blocks,headings:blocks.filter(b=>b.kind==='heading').map(b=>({blockId:b.id,text:b.text,level:b.level})),relatedContent:[{id:'note',kind:'comment',label:'批注 1',text:'此处复杂对象不能直接编辑。',sourcePart:'word/comments.xml',anchorBlockIds:['complex']}],sections:[],plainText:blocks.map(b=>b.text).join('\n'),warnings:[],compatibility:{producer:'隔离组件夹具',paragraphCount:7,headingCount:2,listItemCount:1,tableCount:1,imageCount:0,renderableImageCount:0,styleCount:2,numberingDefinitionCount:1,mergedCellCount:0,pageBreakCount:0,renderedPageBreakCount:0,sectionCount:1,headerCount:0,footerCount:0,comments:true,fields:true,unknownWordParts:[]}}}
const disk=new Map([[initial.path,clone(initial)]]),audit={store,calls:[],writes:[],disk,holdPreview:false,holdSave:false,previewQueue:[],saveQueue:[],failPreview:false,failSave:false,failRead:false}
const operations=args=>args.operations||[args.operation||{kind:'text',targetId:args.targetId,expectedTextDigest:args.expectedTextDigest,replacementText:args.replacementText}]
const digest=async ops=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ops))))).map(b=>b.toString(16).padStart(2,'0')).join('')
const preview=async args=>({status:args.operations?'batch_isolated_verified':'isolated_verified',outputDigest:await digest(operations(args)),outputBytes:4300,changedParts:['word/document.xml'],unchangedPartsVerified:true,structuralReparseVerified:true,semanticReparseVerified:true,sourceUnchanged:true,operationCount:operations(args).length,deterministicReplayVerified:true,temporaryCopyReopenVerified:true})
async function save(command,args){
 if(audit.failSave)throw Error('目录不可写，请保留草稿重试')
 const original=disk.get(args.path);if(original.signature!==args.expectedSignature)throw Error('DOCX 已被外部修改')
 if(await digest(operations(args))!==args.expectedOutputDigest)throw Error('验证输出已过期')
 const copy=command.endsWith('_copy'),targetPath=copy?'C:/ui/'+args.targetFileName:args.path;if(copy&&disk.has(targetPath))throw Error('目标文件已存在')
 const next=clone(original);next.path=targetPath;next.signature='sig-'+(Number(original.signature.split('-')[1])+1)
 for(const op of operations(args)){if(op.kind!=='text')continue;const t=next.editableTextTargets.find(t=>t.id===op.targetId);t.text=op.replacementText;const b=next.model.blocks.find(b=>b.id===t.blockId);if(t.kind==='table-cell')b.rows[t.rowIndex].cells[t.columnIndex].text=t.text;else b.text=t.text}
 next.model.plainText=next.model.blocks.map(b=>b.text).join('\n');disk.set(targetPath,next);audit.writes.push({command,args:clone(args),targetPath})
 return {status:args.operations?(copy?'batch_saved_verified':'batch_source_saved_verified'):(copy?'saved_verified':'source_saved_verified'),path:targetPath,targetPath,signature:next.signature,digest:args.expectedOutputDigest,outputBytes:4300,sourceUnchanged:copy,rollbackProtected:!copy,unchangedPartsVerified:true,structuralReopenVerified:true,semanticReopenVerified:true,producerEvidence:['word-fixture','libreoffice-fixture','wps-fixture']}
}
window.__TAURI_INTERNALS__={transformCallback:()=>1,metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},invoke:async(command,args)=>{
 audit.calls.push({command,args:clone(args||{})})
 if(['read_docx_document','read_external_docx_document'].includes(command)){if(audit.failRead){audit.failRead=false;throw Error('保存后读取暂时失败')}return clone(disk.get(args.path)||{...initial,path:args.path})}
 if(command.startsWith('preview_docx_')){if(audit.failPreview)throw Error('检查未通过，原文件未修改');if(audit.holdPreview)return new Promise((resolve,reject)=>audit.previewQueue.push({args:clone(args),resolve:async()=>resolve(await preview(args)),reject}));return preview(args)}
 if(command.startsWith('save_docx_')){if(audit.holdSave)return new Promise((resolve,reject)=>audit.saveQueue.push({args:clone(args),resolve:async()=>{try{resolve(await save(command,args))}catch(e){reject(e)}},reject}));return save(command,args)}
 if(command==='save_config')return;if(command==='plugin:event|listen')return 1;if(command.startsWith('plugin:event|'))return
 throw Error('Unexpected simulated command: '+command)
}}
window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}}
store.activeLibraryPath='C:/ui';store.configReady=true
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/docx',name:'DocxEditor',component:DocxReaderView},{path:'/other',component:{render:()=>h('div','其他页面')}}]});await router.push('/docx?path=C:/ui/项目计划.docx');audit.router=router;window.docxAudit=audit
store.theme='white';store.visualStyle='soft';store.motionSpeed='normal'
watch(()=>store.theme,value=>{document.body.dataset.theme=resolveThemeName(value,false);document.body.classList.toggle('is-dark',isDarkTheme(value,false))},{immediate:true})
watch(()=>store.visualStyle,value=>document.body.dataset.style=value,{immediate:true})
const overrides=computed(()=>{const tone=getThemeTone(store.theme,false).ui,radius=VISUAL_STYLE_RADII[store.visualStyle];return {common:{primaryColor:tone.primary,primaryColorHover:tone.primary,primaryColorPressed:tone.primary,textColor1:tone.text,textColor2:tone.text+'c7',textColor3:tone.text+'8f',borderColor:tone.text+'26',cardColor:tone.surface,modalColor:tone.surface,popoverColor:tone.surface,bodyColor:'transparent',borderRadius:radius.normal,borderRadiusSmall:radius.small}}})
document.body.dataset.motion='normal';document.body.style.margin='0';document.querySelector('#app').style.height='100vh'
const app=createApp({render:()=>h(NConfigProvider,{theme:isDarkTheme(store.theme,false)?darkTheme:null,themeOverrides:overrides.value},()=>h(NDialogProvider,{},()=>h(NMessageProvider,{},()=>h(RouterView))))});app.component('n-button',NButton).component('n-spin',NSpin).use(pinia).use(router).mount('#app');document.querySelector('.n-config-provider').style.height='100%'
if(new URLSearchParams(location.search).has('tooltips')){const {installAppTooltipPolicy}=await import('/src/services/appTooltipPolicy.ts');installAppTooltipPolicy()}
