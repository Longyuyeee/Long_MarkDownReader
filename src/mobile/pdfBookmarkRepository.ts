import {readPdfBookmarks,updatePdfBookmarks,pdfBookmarkStoreKey,type PdfBookmarkScope,type PdfBookmarkAction} from './pdfBookmarks.ts'

export interface PdfBookmarkSnapshot {content:string|null;revision:string}
export interface PdfBookmarkPersistence {
  readonly preview:boolean
  readPdfBookmarks():Promise<PdfBookmarkSnapshot>
  writePdfBookmarks(content:string,expectedRevision:string):Promise<PdfBookmarkSnapshot>
}
type Legacy=Pick<Storage,'getItem'>
function memory(content:string|null){return {content,getItem(){return this.content},setItem(_key:string,value:string){this.content=value}}}
function checked(value:PdfBookmarkSnapshot){
  if(!value||!(value.content===null||typeof value.content==='string')||!(value.content===null?value.revision==='missing':/^[a-f0-9]{64}$/.test(value.revision)))throw Error('本机书签回复无法核对，原数据仍保留，请重新读取。')
  return value
}
async function snapshot(scope:PdfBookmarkScope,store:PdfBookmarkPersistence,legacy?:Legacy){
  let value=checked(await store.readPdfBookmarks())
  if(value.content===null&&!store.preview){
    let old:string|null
    try{old=(legacy??localStorage).getItem(pdfBookmarkStoreKey)}catch{throw Error('旧书签暂时无法读取，未创建空白记录，请重试。')}
    if(old!==null){
      readPdfBookmarks(scope,memory(old)) // Validate before migrating; never clear the legacy record.
      try{value=checked(await store.writePdfBookmarks(old,'missing'))}
      catch(error){
        // Another reader may have migrated first. Only a verified native record can win.
        try{const current=checked(await store.readPdfBookmarks());if(current.content===null)throw error;readPdfBookmarks(scope,memory(current.content));return current}catch{throw error}
      }
      if(value.content!==old)throw Error('旧书签迁移回复无法核对，请重新读取，原数据仍保留。')
    }
  }
  return value
}
export async function readPersistedPdfBookmarks(scope:PdfBookmarkScope,store:PdfBookmarkPersistence,legacy?:Legacy){
  return readPdfBookmarks(scope,memory((await snapshot(scope,store,legacy)).content))
}
export async function updatePersistedPdfBookmarks(scope:PdfBookmarkScope,expected:string|null,action:PdfBookmarkAction,store:PdfBookmarkPersistence,legacy?:Legacy){
  const before=await snapshot(scope,store,legacy),buffer=memory(before.content)
  const next=updatePdfBookmarks(scope,expected,action,buffer)
  if(buffer.content!==before.content){
    const saved=checked(await store.writePdfBookmarks(buffer.content!,before.revision))
    if(saved.content!==buffer.content)throw Error('书签保存回复无法核对，请重新读取；当前输入仍保留。')
  }
  return next
}
