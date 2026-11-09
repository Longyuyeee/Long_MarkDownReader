import {pdfPointKey,validPdfPoint,type PdfPoint} from './pdfDocument.ts'
export const pdfReadingLimit=5*1024*1024
export interface PdfReadingSnapshot {content:string|null;revision:string}
export interface PdfReadingStorage {readonly preview:boolean;readPdfReading():Promise<PdfReadingSnapshot>;writePdfReading(content:string,expectedRevision:string):Promise<PdfReadingSnapshot>}
export interface PdfReadingState {point:PdfPoint|null;token:string|null}
type Envelope={version:1;records:Record<string,unknown>}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function parse(raw:string|null):Envelope {
 if(raw===null)return{version:1,records:{}}
 if(new TextEncoder().encode(raw).length>pdfReadingLimit)throw Error('阅读位置记录超过5 MiB，原记录仍保留。')
 let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('阅读位置记录无法读取，原记录仍保留。')}
 if(!object(value)||value.version!==1||!object(value.records))throw Error('阅读位置记录版本无法读取，原记录仍保留。')
 return value as Envelope
}
function state(id:string,root:Envelope):PdfReadingState {
 let identity:unknown;try{identity=JSON.parse(id)}catch{throw Error('阅读位置身份无效。')}
 if(!Array.isArray(identity)||identity.length!==2||identity.some(v=>typeof v!=='string'||!v)||identity[0].length>2048||identity[1].length>4096)throw Error('阅读位置身份无效。')
 const value=root.records[id];if(value!==undefined&&!validPdfPoint(value))throw Error('上次阅读位置无法核对，原记录仍保留。')
 return{point:value===undefined?null:JSON.parse(JSON.stringify(value)),token:value===undefined?null:JSON.stringify(value)}
}
function checked(value:PdfReadingSnapshot){if(!value||!(value.content===null||typeof value.content==='string')||!(value.content===null?value.revision==='missing':/^[a-f0-9]{64}$/.test(value.revision)))throw Error('阅读位置回复无法核对，原记录仍保留。');return value}
async function snapshot(id:string,store:PdfReadingStorage,legacy?:Pick<Storage,'getItem'>){
 let before=checked(await store.readPdfReading())
 if(before.content===null&&!store.preview){
  let old:string|null;try{old=(legacy??localStorage).getItem(pdfPointKey)}catch{throw Error('旧阅读位置暂时无法读取，未创建空白记录。')}
  if(old!==null){
   if(new TextEncoder().encode(old).length>pdfReadingLimit)throw Error('旧阅读位置记录超过5 MiB，原记录仍保留。')
   let records:unknown;try{records=JSON.parse(old)}catch{throw Error('旧阅读位置无法读取，原记录仍保留。')}
   if(!object(records))throw Error('旧阅读位置格式无法读取，原记录仍保留。')
   const content=JSON.stringify({version:1,records});state(id,parse(content))
   try{before=checked(await store.writePdfReading(content,'missing'))}
   catch(error){try{const winner=checked(await store.readPdfReading());if(winner.content===null)throw error;state(id,parse(winner.content));return winner}catch{throw error}}
   if(before.content!==content)throw Error('阅读位置迁移回复无法核对，原记录仍保留。')
  }
 }
 return before
}
export async function readPersistedPdfPoint(id:string,store:PdfReadingStorage,legacy?:Pick<Storage,'getItem'>){return state(id,parse((await snapshot(id,store,legacy)).content))}
export async function updatePersistedPdfPoint(id:string,expected:string|null,point:PdfPoint,store:PdfReadingStorage,legacy?:Pick<Storage,'getItem'>){
 if(!validPdfPoint(point))throw Error('阅读位置无效，未覆盖此前记录。')
 const before=await snapshot(id,store,legacy),root=parse(before.content),current=state(id,root)
 if(current.token!==expected)throw Error('阅读位置已在别处变化，未覆盖新记录，请重新读取核对。')
 const merged={...current.point,...point,horizontal:point.horizontal??0,mode:point.mode??'single',rotation:point.rotation??0,pageOffset:point.pageOffset??0,pageInset:point.pageInset??0}
 const next={...root,records:{...root.records,[id]:merged}},content=JSON.stringify(next);parse(content)
 const saved=checked(await store.writePdfReading(content,before.revision));if(saved.content!==content)throw Error('阅读位置保存回复无法核对，原记录仍保留。')
 return state(id,next)
}
const comparable=(p:PdfPoint)=>JSON.stringify([p.fingerprint,p.page,p.fraction,p.horizontal??0,p.zoom,p.mode??'single',p.rotation??0,p.pageOffset??0,p.pageInset??0])
export type PdfReadingPhase='loading'|'ready'|'saving'|'read-error'|'save-error'
/** One immutable document identity; acknowledged snapshots never alias caller objects. */
export function createPdfReadingSession(id:string,store:PdfReadingStorage,notify:(phase:PdfReadingPhase,error?:unknown)=>void,legacy?:Pick<Storage,'getItem'>,validate?:(point:PdfPoint|null)=>void){
 let loaded=false,token:string|null=null,confirmed='',pending:PdfPoint|null=null,job:Promise<boolean>|null=null
 async function load(){await job;loaded=false;pending=null;notify('loading');try{const value=await readPersistedPdfPoint(id,store,legacy);validate?.(value.point);token=value.token;confirmed=value.point?comparable(value.point):'';loaded=true;notify('ready');return value.point}catch(error){notify('read-error',error);throw error}}
 async function flush():Promise<boolean>{
  if(!loaded)return false
  for(;;){
   if(job){if(!await job)return false;continue}
   if(!pending||comparable(pending)===confirmed){pending=null;notify('ready');return true}
   const captured=pending;pending=null;notify('saving')
   job=(async()=>{try{const saved=await updatePersistedPdfPoint(id,token,captured,store,legacy);token=saved.token;confirmed=comparable(captured);return true}catch(error){pending??=captured;notify('save-error',error);return false}})().finally(()=>{job=null})
   if(!await job)return false
  }
 }
 function save(point:PdfPoint){if(!validPdfPoint(point))throw Error('阅读位置无效，未覆盖此前记录。');validate?.(point);pending=JSON.parse(JSON.stringify(point));return flush()}
 return{load,save,flush}
}
