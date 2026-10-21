import './workflow-redesign-browser.mjs'
import PdfView from '/src/views/PdfView.vue'
import {managedReadingMarkdown} from '/src/utils/pdfReadingContinuity.ts'
const a=window.workflowAudit,root=a.store.libraryPath,original=window.__TAURI_INTERNALS__.invoke
const item=(id,comment)=>({annotation:{id,kind:'comment',color:'yellow',page:1,quote:'阅读原文 '+id,comment,rects:[],createdAt:1,updatedAt:1},uri:'longedit://pdf?path=Paper.pdf&page=1&annotation='+id+'&sha256='+'a'.repeat(64),label:'Paper.pdf · 第 1 页'})
a.oldSnapshot={sourceDigest:'a'.repeat(64),sourceSignature:'fixture',relativePath:'Paper.pdf',knownAnnotationIds:['a','b','unselected'],items:[item('a','原评论'),item('b','后来删除')],missingIds:[]}
a.freshSnapshot={...a.oldSnapshot,knownAnnotationIds:['a','unselected','new'],items:[item('a','更新后的评论')],missingIds:['b']}
const pdfBytes=[...new Uint8Array(await(await fetch('/scripts/fixtures/v126-search/Paper.pdf')).arrayBuffer())]
a.pdfAnnotations=structuredClone(a.oldSnapshot.items.map(i=>i.annotation))
a.disk.set(root+'/Paper.pdf','PDF fixture')
a.generated=managedReadingMarkdown(a.oldSnapshot,'page',true);a.note='# 我的阅读成果\n\n未保存补写，不能丢。\n\n'+a.generated+'\n保留尾部文字。\n'
a.disk.set(a.store.tabs[0].path,a.note);a.store.tabs[0].content=a.note;a.store.tabs[0].isDirty=true
a.router.addRoute({path:'/pdf',name:'Pdf',component:PdfView})
window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
 if(command==='read_pdf_info')return {length:pdfBytes.length,signature:'fixture',fullData:pdfBytes}
 if(command==='read_pdf_annotations')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:pdfBytes.length,modifiedAt:1},annotations:structuredClone(a.pdfAnnotations)}
 if(command==='read_pdf_ocr')return {schemaVersion:1,source:{pdfFile:'Paper.pdf',size:pdfBytes.length,modifiedAt:1},provider:{id:'tesseract-wasm',version:'fixture',languages:['eng']},pages:[]}
 if(command==='write_pdf_annotations'){a.pdfAnnotations=structuredClone(args.document.annotations);return}
 if(command==='verify_pdf_reference')return {sourceDigest:'a'.repeat(64),sourceSignature:'fixture'}
 if(command==='build_pdf_reading_note')return {...structuredClone(a.oldSnapshot),items:structuredClone(a.oldSnapshot.items.filter(i=>args.annotationIds.includes(i.annotation.id)))}

 if(command==='refresh_pdf_reading_note'){
  a.calls.push({command,args});if(a.holdRefresh){a.holdRefresh=false;await new Promise(resolve=>a.releaseRefresh=resolve)}
  if(a.refreshError)throw Error(a.refreshError)
  return structuredClone({...a.freshSnapshot,items:[...a.freshSnapshot.items,...((args.includeNew||args.annotationIds.includes('new'))?[item('new','新批注')]:[])]})
 }
 return original(command,args)
}
