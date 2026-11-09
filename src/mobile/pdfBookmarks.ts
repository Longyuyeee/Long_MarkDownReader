import type {Identity} from './storage'

export interface PdfBookmark {page:number;title:string}
export interface PdfBookmarkScope extends Identity {fingerprint:string;pages:number}
export interface PdfBookmarkRecord {pages:number;revision:number;items:PdfBookmark[];draft?:PdfBookmark;removed?:PdfBookmark}
export interface PdfBookmarkState {record:PdfBookmarkRecord;token:string|null;older:{fingerprint:string;record:PdfBookmarkRecord|null}[]}
export type PdfBookmarkAction = {type:'add'|'edit'|'delete';page:number}|{type:'draft';page:number;title:string}|{type:'save'|'undo'}|{type:'cancel';page:number}
type Store = Pick<Storage,'getItem'|'setItem'>
export const pdfBookmarkStoreKey='longedit-mobile-pdf-bookmarks-v1'
export const pdfBookmarkLimit=200
const budget=512*1024,object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const validPage=(page:unknown,pages:number)=>Number.isInteger(page)&&Number(page)>=1&&Number(page)<=pages
const validTitle=(title:unknown)=>typeof title==='string'&&title.trim().length>0&&Array.from(title).length<=80&&!/[\x00-\x1f\x7f]/.test(title)
function scopeKey(scope:PdfBookmarkScope){
  if(!scope.rootId||scope.rootId.length>2048||!scope.relativePath||scope.relativePath.length>4096||!/^[a-f0-9]{64}$/.test(scope.fingerprint)||!Number.isInteger(scope.pages)||scope.pages<1||scope.pages>1_000_000)throw Error('这份文件的书签来源无法确认，未改写记录。')
  return JSON.stringify([scope.rootId,scope.relativePath,scope.fingerprint])
}
function validate(value:unknown):asserts value is PdfBookmarkRecord {
  if(!object(value)||!Number.isInteger(value.pages)||Number(value.pages)<1||Number(value.pages)>1_000_000||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||!Array.isArray(value.items)||value.items.length>pdfBookmarkLimit)throw Error('书签记录无法读取，原数据仍保留。')
  const seen=new Set<number>()
  for(const item of value.items){if(!object(item)||!validPage(item.page,Number(value.pages))||!validTitle(item.title)||seen.has(Number(item.page)))throw Error('书签记录无法读取，原数据仍保留。');seen.add(Number(item.page))}
  if(value.removed!==undefined&&(!object(value.removed)||!validPage(value.removed.page,Number(value.pages))||!validTitle(value.removed.title)))throw Error('可撤销的书签记录无法读取，原数据仍保留。')
  if(value.draft!==undefined&&(!object(value.draft)||!validPage(value.draft.page,Number(value.pages))||!seen.has(Number(value.draft.page))||typeof value.draft.title!=='string'||value.draft.title.length>160))throw Error('书签名称草稿无法读取，原数据仍保留。')
}
function envelope(store:Store):{version:1;records:Record<string,unknown>} {
  let raw:string|null;try{raw=store.getItem(pdfBookmarkStoreKey)}catch{throw Error('本机书签暂时无法读取，原数据仍保留，请重试。')}
  if(raw===null)return {version:1,records:{}}
  if(new TextEncoder().encode(raw).length>budget)throw Error('书签记录较大，暂不改写，原数据仍保留。')
  let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('书签记录无法读取，原数据仍保留。')}
  if(!object(value)||value.version!==1||!object(value.records))throw Error('书签记录版本无法读取，原数据仍保留。')
  return value as {version:1;records:Record<string,unknown>}
}
function state(scope:PdfBookmarkScope,root:ReturnType<typeof envelope>):PdfBookmarkState {
  const key=scopeKey(scope),raw=root.records[key]
  if(raw!==undefined)validate(raw)
  const record=raw as PdfBookmarkRecord|undefined
  if(record&&record.pages!==scope.pages)throw Error('书签记录的页数与文件不符，原数据仍保留。')
  const older:PdfBookmarkState['older']=[]
  for(const [id,value] of Object.entries(root.records)){
    if(id===key)continue
    let parts:unknown;try{parts=JSON.parse(id)}catch{continue}
    if(!Array.isArray(parts)||parts.length!==3||parts[0]!==scope.rootId||parts[1]!==scope.relativePath||typeof parts[2]!=='string'||!/^[a-f0-9]{64}$/.test(parts[2]))continue
    try{validate(value);older.push({fingerprint:parts[2],record:value})}catch{older.push({fingerprint:parts[2],record:null})}
  }
  return {record:record||{pages:scope.pages,revision:0,items:[]},token:raw===undefined?null:JSON.stringify(raw),older}
}
export function readPdfBookmarks(scope:PdfBookmarkScope,store:Store=localStorage){return state(scope,envelope(store))}

/** One atomic localStorage write; compare the entire current record and preserve other files/versions. */
export function updatePdfBookmarks(scope:PdfBookmarkScope,expected:string|null,action:PdfBookmarkAction,store:Store=localStorage):PdfBookmarkState {
  const root=envelope(store),current=state(scope,root),record=current.record
  if(current.token!==expected)throw Error('书签已在别处变化。请重新读取；当前名称输入会保留。')
  if(record.revision===Number.MAX_SAFE_INTEGER)throw Error('书签版本已达上限，未覆盖原记录。')
  const next:PdfBookmarkRecord={...record,items:record.items.map(item=>({...item})),revision:record.revision+1}
  const page='page'in action?action.page:0,existing=record.items.find(item=>item.page===page)
  if('page'in action&&!validPage(page,scope.pages))throw Error('这枚书签的页码无效，未改写记录。')
  if(record.draft&&['add','edit','delete','undo'].includes(action.type)&&!(action.type==='edit'&&record.draft.page===page))throw Error(`请先保存或取消第 ${record.draft.page} 页的名称修改。`)
  switch(action.type){
    case 'add':
      if(existing)return current
      if(next.items.length>=pdfBookmarkLimit)throw Error('这份 PDF 已有 200 枚书签，请先移除一枚再添加。')
      next.items.push({page,title:`第 ${page} 页`});break
    case 'edit':
      if(!existing)throw Error('这枚书签已经不存在，未覆盖其他记录。')
      if(record.draft)return current
      next.draft={...existing};break
    case 'draft':
      if(!existing)throw Error('这枚书签已在别处删除，当前输入仍保留。')
      if(record.draft&&record.draft.page!==page)throw Error('已有其他书签的名称草稿，未覆盖它。')
      if(action.title.length>160)throw Error('名称输入较长，未改写草稿。')
      if(record.draft?.page===page&&record.draft.title===action.title)return current
      next.draft={page,title:action.title};break
    case 'save':{
      const draft=record.draft
      if(!draft||!record.items.some(item=>item.page===draft.page))throw Error('没有可保存的名称修改。')
      if(!validTitle(draft.title))throw Error('书签名称请填写 1 到 80 个字，不能包含控制字符。')
      next.items=next.items.map(item=>item.page===draft.page?{page:item.page,title:draft.title.trim()}:item);delete next.draft;break
    }
    case 'cancel':
      if(record.draft&&record.draft.page!==page)throw Error('名称草稿已变化，未丢弃其他输入。')
      delete next.draft;break
    case 'delete':
      if(!existing)throw Error('这枚书签已经不存在，未覆盖其他记录。')
      next.removed={...existing};next.items=next.items.filter(item=>item.page!==page);break
    case 'undo':
      if(!record.removed)throw Error('没有可撤销的删除。')
      if(record.items.some(item=>item.page===record.removed!.page))throw Error('这一页已有书签，未覆盖现有名称。')
      if(record.items.length>=pdfBookmarkLimit)throw Error('书签已达 200 枚，请先移除一枚再恢复。')
      next.items.push({...record.removed});delete next.removed;break
  }
  next.items.sort((a,b)=>a.page-b.page);validate(next)
  const updated={...root,records:{...root.records,[scopeKey(scope)]:next}},serialized=JSON.stringify(updated)
  if(new TextEncoder().encode(serialized).length>budget)throw Error('本机书签空间已达上限，未清除或覆盖任何旧书签。')
  try{store.setItem(pdfBookmarkStoreKey,serialized)}catch{throw Error('书签未保存，本机空间可能不足；原记录仍保留，请重试。')}
  return state(scope,updated)
}
