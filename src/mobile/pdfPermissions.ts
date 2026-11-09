export interface PdfAccess { known:boolean; copy:boolean; annotate:boolean; restricted:boolean }
export function pdfAccess(value:unknown):PdfAccess {
  if(value===null)return{known:true,copy:true,annotate:true,restricted:false}
  if(!Array.isArray(value)||value.some(n=>!Number.isSafeInteger(n)||n<=0))return{known:false,copy:false,annotate:false,restricted:true}
  const copy=value.includes(16),annotate=value.includes(32)
  return{known:true,copy,annotate,restricted:!copy||!annotate}
}
export async function readPdfAccess(pdf:{getPermissions:()=>Promise<unknown>}):Promise<PdfAccess>{
  try{return pdfAccess(await pdf.getPermissions())}catch{return pdfAccess(undefined)}
}
/** Only source text is protected. Users may still copy their own comment inputs. */
export function pdfSourceText(node:Node|null,root:HTMLElement|undefined):boolean{
  const element=node?.nodeType===1?node as Element:node?.parentElement
  return !!element&&!!root?.contains(element)&&!!element.closest('.textLayer,.pdf-page-text,.pdf-results')
}
