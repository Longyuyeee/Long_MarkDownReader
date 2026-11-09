import {draftKey,validateAnnotationDraft,type PdfAnnotationDraft} from './pdfAnnotations.ts'
import {storageKey,validateDeletionJournal,type PdfDeletionJournal} from './pdfDeletion.ts'
export const pdfRecoveryKey='longedit-mobile-pdf-annotation-recovery-v1',pdfRecoveryLimit=5*1024*1024
export interface PdfRecoverySnapshot {content:string|null;revision:string}
export interface PdfRecoveryStorage {readPdfAnnotationRecovery():Promise<PdfRecoverySnapshot>;writePdfAnnotationRecovery(content:string,expectedRevision:string):Promise<PdfRecoverySnapshot>}
export interface PdfRecoveryState {draft:PdfAnnotationDraft|null;journal:PdfDeletionJournal|null;token:string}
type Envelope={version:1;drafts:Record<string,unknown>;deletions:Record<string,unknown>}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
function parse(raw:string|null):Envelope {
 if(raw===null)return{version:1,drafts:{},deletions:{}}
 if(new TextEncoder().encode(raw).length>pdfRecoveryLimit)throw Error('批注恢复记录超过5 MiB，原数据仍保留。')
 let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('批注恢复记录无法读取，原数据仍保留。')}
 if(!object(value)||value.version!==1||!object(value.drafts)||!object(value.deletions))throw Error('批注恢复记录版本无法读取，原数据仍保留。')
 return value as Envelope
}
function state(id:string,envelope:Envelope):PdfRecoveryState {
 let identity:unknown;try{identity=JSON.parse(id)}catch{throw Error('批注恢复身份无效。')}
 if(!Array.isArray(identity)||identity.length!==2||identity.some(v=>typeof v!=='string'||!v)||identity[0].length>2048||identity[1].length>4096)throw Error('批注恢复身份无效。')
 const draft=envelope.drafts[id]??null,journal=envelope.deletions[id]??null
 if(draft!==null)validateAnnotationDraft(draft)
 if(journal!==null)validateDeletionJournal(journal)
 return{draft,journal,token:JSON.stringify([draft,journal])}
}
function checked(snapshot:PdfRecoverySnapshot){if(!snapshot||!(snapshot.content===null||typeof snapshot.content==='string')||!(snapshot.content===null?snapshot.revision==='missing':/^[a-f0-9]{64}$/.test(snapshot.revision)))throw Error('批注恢复回复无法核对，原数据仍保留。');return snapshot}
async function snapshot(id:string,store:PdfRecoveryStorage,legacy?:Pick<Storage,'getItem'>){
 let before=checked(await store.readPdfAnnotationRecovery())
 if(before.content===null){
  let d:string|null,j:string|null;try{d=(legacy??localStorage).getItem(draftKey);j=(legacy??localStorage).getItem(storageKey)}catch{throw Error('旧批注恢复记录暂时无法读取，未创建空白记录，请重试。')}
  if(d!==null||j!==null){
   if(new TextEncoder().encode(d??'').length+new TextEncoder().encode(j??'').length>pdfRecoveryLimit)throw Error('旧批注恢复记录超过5 MiB，原数据仍保留。')
   let drafts:unknown,deletions:unknown;try{drafts=d===null?{}:JSON.parse(d);deletions=j===null?{}:JSON.parse(j)}catch{throw Error('旧批注恢复记录无法读取，原数据仍保留。')}
   if(!object(drafts)||!object(deletions))throw Error('旧批注恢复记录格式无法读取，原数据仍保留。')
   const content=JSON.stringify({version:1,drafts,deletions});state(id,parse(content))
   try{before=checked(await store.writePdfAnnotationRecovery(content,'missing'))}
   catch(error){try{const winner=checked(await store.readPdfAnnotationRecovery());if(winner.content===null)throw error;state(id,parse(winner.content));return winner}catch{throw error}}
   if(before.content!==content)throw Error('批注恢复迁移回复无法核对，原数据仍保留。')
  }
 }
 return before
}
export async function readPdfRecovery(id:string,store:PdfRecoveryStorage,legacy?:Pick<Storage,'getItem'>){return state(id,parse((await snapshot(id,store,legacy)).content))}
export async function updatePdfRecovery(id:string,expected:string,patch:{draft?:PdfAnnotationDraft|null;journal?:PdfDeletionJournal|null},store:PdfRecoveryStorage,legacy?:Pick<Storage,'getItem'>){
 const before=await snapshot(id,store,legacy),root=parse(before.content),current=state(id,root)
 if(current.token!==expected)throw Error('批注恢复记录已在别处变化；当前输入仍保留。可复制输入后放弃当前输入，核对最新恢复记录。')
 const next={...root,drafts:{...root.drafts},deletions:{...root.deletions}}
 for(const [field,map]of [['draft','drafts'],['journal','deletions']] as const)if(Object.prototype.hasOwnProperty.call(patch,field)){if(patch[field]===null)delete next[map][id];else next[map][id]=patch[field]}
 const value=state(id,next),content=JSON.stringify(next);parse(content)
 if(value.token===current.token)return current
 const saved=checked(await store.writePdfAnnotationRecovery(content,before.revision));if(saved.content!==content)throw Error('批注恢复保存回复无法核对；当前输入仍保留，请重试。')
 return value
}
