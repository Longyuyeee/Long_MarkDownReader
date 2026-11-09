import {sourceReadingKey,validSourceBookmark,type SourceBookmark} from './sourceReadingState.ts'
export const sourceReadingLimit=5*1024*1024
export interface SourceReadingSnapshot {content:string|null;revision:string}
export interface SourceReadingStorage {readonly preview:boolean;readSourceReading():Promise<SourceReadingSnapshot>;writeSourceReading(content:string,expectedRevision:string):Promise<SourceReadingSnapshot>}
export interface SourceReadingState {point:SourceBookmark|null;token:string|null}
type Envelope={version:1;records:Record<string,unknown>}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function parse(raw:string|null):Envelope {
 if(raw===null)return{version:1,records:{}}
 if(new TextEncoder().encode(raw).length>sourceReadingLimit)throw Error('阅读位置记录超过5 MiB，原记录仍保留。')
 let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('阅读位置记录无法读取，原记录仍保留。')}
 if(!object(value)||value.version!==1||!object(value.records))throw Error('阅读位置记录版本无法读取，原记录仍保留。')
 return value as Envelope
}
function state(id:string,root:Envelope):SourceReadingState {
 if(!id||id.length>8192||id.includes('\0'))throw Error('阅读位置身份无效。')
 const value=root.records[id];if(value!==undefined&&!validSourceBookmark(value))throw Error('上次阅读位置无法核对，原记录仍保留。')
 return{point:value===undefined?null:JSON.parse(JSON.stringify(value)),token:value===undefined?null:JSON.stringify(value)}
}
function checked(value:SourceReadingSnapshot){if(!value||!(value.content===null||typeof value.content==='string')||!(value.content===null?value.revision==='missing':/^[a-f0-9]{64}$/.test(value.revision)))throw Error('阅读位置回复无法核对，原记录仍保留。');return value}
async function snapshot(id:string,store:SourceReadingStorage,legacy?:Pick<Storage,'getItem'>){
 let before=checked(await store.readSourceReading())
 if(before.content===null&&!store.preview){
  let old:string|null;try{old=(legacy??localStorage).getItem(sourceReadingKey)}catch{throw Error('旧阅读位置暂时无法读取，未创建空白记录。')}
  if(old!==null){
   if(new TextEncoder().encode(old).length>sourceReadingLimit)throw Error('旧阅读位置记录超过5 MiB，原记录仍保留。')
   let records:unknown;try{records=JSON.parse(old)}catch{throw Error('旧阅读位置无法读取，原记录仍保留。')}
   if(!object(records))throw Error('旧阅读位置格式无法读取，原记录仍保留。')
   const content=JSON.stringify({version:1,records});state(id,parse(content))
   try{before=checked(await store.writeSourceReading(content,'missing'))}
   catch(error){try{const winner=checked(await store.readSourceReading());if(winner.content===null)throw error;state(id,parse(winner.content));return winner}catch{throw error}}
   if(before.content!==content)throw Error('阅读位置迁移回复无法核对，原记录仍保留。')
  }
 }
 return before
}
export async function readPersistedSourcePoint(id:string,store:SourceReadingStorage,legacy?:Pick<Storage,'getItem'>){return state(id,parse((await snapshot(id,store,legacy)).content))}
export async function updatePersistedSourcePoint(id:string,expected:string|null,point:SourceBookmark,store:SourceReadingStorage,legacy?:Pick<Storage,'getItem'>){
 if(!validSourceBookmark(point))throw Error('阅读位置无效，未覆盖此前记录。')
 const before=await snapshot(id,store,legacy),root=parse(before.content),current=state(id,root)
 if(current.token!==expected)throw Error('阅读位置已在别处变化，未覆盖新记录，请重新读取核对。')
 const merged={...current.point,...point,horizontal:point.horizontal??0,query:point.query??'',querySelection:point.querySelection??null,match:point.match??null,selection:point.selection??null,anchor:point.anchor??null}
 const next={...root,records:{...root.records,[id]:merged}},content=JSON.stringify(next);parse(content)
 const saved=checked(await store.writeSourceReading(content,before.revision));if(saved.content!==content)throw Error('阅读位置保存回复无法核对，原记录仍保留。')
 return state(id,next)
}
const comparable=(p:SourceBookmark)=>JSON.stringify([p.fingerprint,p.offset,p.scroll,p.horizontal??0,p.query??'',p.querySelection??null,p.match??null,p.selection??null,p.anchor??null])
export type SourceReadingPhase='loading'|'ready'|'saving'|'read-error'|'save-error'
/** One immutable document identity; acknowledged snapshots never alias caller objects. */
export function createSourceReadingSession(id:string,store:SourceReadingStorage,notify:(phase:SourceReadingPhase,error?:unknown)=>void,legacy?:Pick<Storage,'getItem'>,validate?:(point:SourceBookmark|null)=>void){
 let loaded=false,token:string|null=null,confirmed='',pending:SourceBookmark|null=null,job:Promise<boolean>|null=null
 async function load(){await job;loaded=false;pending=null;notify('loading');try{const value=await readPersistedSourcePoint(id,store,legacy);validate?.(value.point);token=value.token;confirmed=value.point?comparable(value.point):'';loaded=true;notify('ready');return value.point}catch(error){notify('read-error',error);throw error}}
 async function flush():Promise<boolean>{
  if(!loaded)return false
  for(;;){
   if(job){if(!await job)return false;continue}
   if(!pending||comparable(pending)===confirmed){pending=null;notify('ready');return true}
   const captured=pending;pending=null;notify('saving')
   job=(async()=>{try{const saved=await updatePersistedSourcePoint(id,token,captured,store,legacy);token=saved.token;confirmed=comparable(captured);return true}catch(error){pending??=captured;notify('save-error',error);return false}})().finally(()=>{job=null})
   if(!await job)return false
  }
 }
 function save(point:SourceBookmark){if(!validSourceBookmark(point))throw Error('阅读位置无效，未覆盖此前记录。');validate?.(point);pending=JSON.parse(JSON.stringify(point));return flush()}
 return{load,save,flush}
}
