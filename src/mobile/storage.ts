import {preferencesKey,parsePreferences,type PreferencesSnapshot} from './appearanceRepository'
import {createMetadataTransport} from './metadataTransport'
import {sourceReadingKey} from './sourceReadingState'
import {sourceReadingLimit,type SourceReadingSnapshot} from './sourceReadingRepository'
import {receivedPdfName,receivedPdfPath,checkedReceivedPdf,checkPdfIntakeCapacity,type PdfImportRecord,type PdfImportSummary} from './pdfImport'
import {pdfBookmarkStoreKey} from './pdfBookmarks'
import type {PdfBookmarkSnapshot} from './pdfBookmarkRepository'
import {pdfRecoveryKey,type PdfRecoverySnapshot} from './pdfAnnotationRecovery'
import {pdfPointKey} from './pdfDocument'
import {pdfReadingLimit,type PdfReadingSnapshot} from './pdfReadingRepository'
import {readingBookmarkKey} from './readingState'
import {textReadingLimit,type TextReadingSnapshot} from './textReadingRepository'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { imageFileInfo } from './imageFile'
import { pdfLimit, pdfSupported, validatePdfBytes, type PdfSource } from './pdfDocument'
import { mobileTextPattern, textFileExtension } from './codeFormats'
import { parseAnnotations, serializeAnnotations, type PdfAnnotationState } from './pdfAnnotations'
import { textExportName, type TextExportSnapshot, type TextExportResult } from './textExport'
import { decodeImportedText, importedCopyName, importedFileName, type FileImportSummary, type FileImportRecord, type IncomingStatus } from './textImport'
import { base64Bytes, bytesBase64, hashBytes, packArchive, packName, type PreparedPack, type PackSummary, type PackInfo } from './portablePack'
import { importedImageData, packImportLimit, packImportName, packImportTarget, parseImportedPack, validatePackContent, type PackImportRecord, type PackImportSummary } from './packImport'

export interface Library { id: string; name: string; external: boolean; available: boolean; writable: boolean }
export interface Entry { name: string; relativePath: string; directory: boolean; modified: number; size: number }
export interface Identity { rootId: string; relativePath: string }
export interface Document extends Identity { content: string; signature: string | null; modified: number }
export interface Draft extends Identity { content: string; expectedSignature: string | null; revision: number; updated: number }
export interface StoredImage { dataUrl: string; width: number; height: number; bytes: number }
export interface ImageImport { id: string; rootId: string; notePath: string; name: string; status: 'ready' | 'unconfirmed'; imagePath: string | null; width: number; height: number; bytes: number; created: number; error: string; attempts: number; previousPaths?: string[] }
export interface RecoverySummary { id: string; relativePath: string; created: number; hasOriginal: boolean; readable: boolean; libraryName?: string; purpose?: 'write' | 'text-export' }
export interface RecoveryRecord extends RecoverySummary { rootId: string; original: string | null; candidate: string }
export interface Storage {
  systemAppearance():Promise<boolean|null>
  applyAppearance(dark:boolean,surface?:'article'|'code'):Promise<void>
  copyText(content:string):Promise<void>
  readPreferences():Promise<PreferencesSnapshot>
  writePreferences(content:string,expectedRevision:string):Promise<PreferencesSnapshot>
  readonly preview: boolean
  recent(): Promise<Identity[]>
  remember(identity: Identity): Promise<void>
  readPdfBookmarks(): Promise<PdfBookmarkSnapshot>
  writePdfBookmarks(content:string,expectedRevision:string): Promise<PdfBookmarkSnapshot>
  readPdfAnnotationRecovery(): Promise<PdfRecoverySnapshot>
  writePdfAnnotationRecovery(content:string,expectedRevision:string): Promise<PdfRecoverySnapshot>
  readPdfReading(): Promise<PdfReadingSnapshot>
  writePdfReading(content:string,expectedRevision:string): Promise<PdfReadingSnapshot>
  readSourceReading():Promise<SourceReadingSnapshot>
  writeSourceReading(content:string,expectedRevision:string):Promise<SourceReadingSnapshot>
  readTextReading():Promise<TextReadingSnapshot>
  writeTextReading(content:string,expectedRevision:string):Promise<TextReadingSnapshot>
  roots(): Promise<Library[]>
  choose(): Promise<Library | null>
  disconnect(rootId: string): Promise<void>
  list(id: string, path: string): Promise<{ entries: Entry[]; truncated: boolean }>
  read(identity: Identity): Promise<Document>
  readPdf(identity: Identity): Promise<PdfSource>
  readPdfAnnotations(identity: Identity): Promise<PdfAnnotationState>
  writePdfAnnotations(identity: Identity, content: string, expectedRevision: string, expectedSignature: string): Promise<PdfAnnotationState>
  importPdf(file?: File): Promise<Identity | null>
  pdfImports():Promise<{entries:PdfImportSummary[]}>
  pdfImport(id:string):Promise<PdfImportRecord>
  commitPdfImport(id:string,expected:string):Promise<Identity>
  removePdfImport(id:string):Promise<void>
  readImage(identity: Identity): Promise<StoredImage>
  readAttachment(identity: Identity): Promise<{ base64: string }>
  packExports(): Promise<{ entries: PackSummary[] }>
  packExport(id: string): Promise<PackInfo>
  exportPack(pack: PreparedPack): Promise<TextExportResult>
  retryPack(id: string): Promise<TextExportResult>
  removePack(id: string): Promise<void>
  choosePackImport(file?: File): Promise<PackImportSummary | null>
  packImports(): Promise<{ entries: PackImportSummary[] }>
  packImport(id: string): Promise<PackImportRecord>
  packImportImage(id: string, path: string): Promise<StoredImage>
  commitPackImport(id: string): Promise<Document>
  removePackImport(id: string): Promise<void>
  importImage(note: Identity, file?: File): Promise<ImageImport | null>
  imageImports(note?: Identity): Promise<{ entries: ImageImport[]; truncated: boolean; unreadable?: number }>
  retryImage(id: string): Promise<ImageImport>
  imageImportPreview(id: string): Promise<StoredImage>
  copyImage(source: Identity, target: Identity): Promise<ImageImport>
  write(identity: Identity, content: string, expectedSignature: string | null): Promise<Document>
  draft(identity: Identity): Promise<Draft | null>
  saveDraft(draft: Draft): Promise<void>
  discardDraft(identity: Identity, revision: number): Promise<void>
  recoveries(): Promise<{ entries: RecoverySummary[]; truncated: boolean }>
  recovery(id: string): Promise<RecoveryRecord>
  copyRecovery(id: string, version: 'candidate' | 'original'): Promise<Document>
  exportRecovery(id: string): Promise<{ exported?: boolean; cancelled?: boolean }>
  exportDocument(snapshot: TextExportSnapshot): Promise<TextExportResult>
  chooseTextImport(file?: File): Promise<FileImportSummary | null>
  fileImports(): Promise<{ entries: FileImportSummary[]; truncated: boolean }>
  fileImport(id: string): Promise<FileImportRecord>
  commitFileImport(id: string): Promise<Document>
  removeFileImport(id: string): Promise<void>
  incomingStatus(): Promise<IncomingStatus>
  acknowledgeIncoming(id?: string, kind?: 'text' | 'pack' | 'pdf'): Promise<void>
}

export const identityKey = (identity: Identity) => JSON.stringify([identity.rootId, identity.relativePath])
export const textSupported = (path: string) => mobileTextPattern.test(path)
export const localCopyName = (path: string, label = '副本') => {
  const name = path.split('/').pop() || '笔记.txt', extension = textFileExtension(name) || '.txt'
  const base = name.replace(mobileTextPattern, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '')
  return `${Array.from(base).slice(0, 40).join('') || '笔记'}-${label}-${crypto.randomUUID()}${extension}`
}
export const humanStorageError = (error: unknown) => /^(?:Error: )?QuotaExceededError(?::|$)/.test(String(error))
  ? '本机存储空间不足，当前输入仍保留；请释放空间后重试。'
  : String(error).match(/(?:CONFLICT|PERMISSION|INVALID_PATH|NOT_FOUND|READ_FAILED|WRITE_FAILED|WRITE_UNCONFIRMED|UNSUPPORTED|TOO_LARGE|SOURCE_UNAVAILABLE|BUSY):\s*(.*)/)?.[1] || String(error).replace(/^Error: /, '')
export const validatePath = (path: string) => {
  if (!path || path.length > 4096 || path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\0]/.test(part))) {
    throw new Error('文件名或位置无效')
  }
}

class AndroidStorage implements Storage {
  readonly preview = false
  private metadata=createMetadataTransport(payload=>invoke('plugin:mobile-storage|execute',{payload}))
  private execute<T>(op: string, args: object = {}): Promise<T> {
    return invoke<T>('plugin:mobile-storage|execute', { payload: { op, ...args } })
  }
  async roots() { return (await this.execute<{ roots: Library[] }>('roots')).roots }
  async recent() {
    let content = ''
    try { content = localStorage.getItem(recentKey) ?? '' } catch { /* Native records remain available without WebView storage. */ }
    return checkedRecent((await this.execute<{ entries: Identity[] }>('recent', { content })).entries)
  }
  async remember(identity: Identity) { await this.execute('remember', identity) }
  readPdfBookmarks(){return this.metadata.read('bookmarks')}
  readPdfAnnotationRecovery(){return this.metadata.read('recovery')}
  readPdfReading(){return this.metadata.read('pdf')}
  writePdfReading(content:string,expectedRevision:string){return this.metadata.write('pdf',content,expectedRevision)}
  async systemAppearance(){const value=await this.execute<{dark:boolean}>('systemAppearance');if(typeof value.dark!=='boolean')throw Error('系统外观回复无法核对。');return value.dark}
  async applyAppearance(dark:boolean,surface?:'article'|'code'){await this.execute('applyAppearance',{content:dark?'dark':'light',surface:surface||'default'})}
  async copyText(content:string){const result=await this.execute<{copied:boolean}>('copyText',{content});if(result.copied!==true)throw Error('复制尚未确认。')}
  readPreferences(){return this.execute<PreferencesSnapshot>('readPreferences')}
  writePreferences(content:string,expectedRevision:string){return this.execute<PreferencesSnapshot>('writePreferences',{content,expectedRevision})}
  readSourceReading(){return this.metadata.read('source')}
  writeSourceReading(content:string,expectedRevision:string){return this.metadata.write('source',content,expectedRevision)}
  readTextReading(){return this.metadata.read('text')}
  writeTextReading(content:string,expectedRevision:string){return this.metadata.write('text',content,expectedRevision)}
  writePdfAnnotationRecovery(content:string,expectedRevision:string){return this.metadata.write('recovery',content,expectedRevision)}
  writePdfBookmarks(content:string,expectedRevision:string){return this.metadata.write('bookmarks',content,expectedRevision)}
  async choose() { return (await this.execute<{ root?: Library }>('choose')).root ?? null }
  async disconnect(rootId: string) { await this.execute('disconnect', { rootId }) }
  list(rootId: string, relativePath: string) { return this.execute<{ entries: Entry[]; truncated: boolean }>('list', { rootId, relativePath }) }
  read(identity: Identity) { return this.execute<Document>('read', identity) }
  readPdf(identity: Identity) { return this.execute<PdfSource>('readPdf', identity) }
  readPdfAnnotations(identity: Identity) { return this.execute<PdfAnnotationState>('readPdfAnnotations',identity) }
  writePdfAnnotations(identity: Identity, content: string, expectedRevision: string, expectedSignature: string) { return this.execute<PdfAnnotationState>('writePdfAnnotations',{...identity,content,expectedRevision,expectedSignature}) }
  async importPdf() { return (await this.execute<{ identity: Identity | null }>('importPdf')).identity }
  pdfImports(){return this.execute<{entries:PdfImportSummary[]}>('pdfImports')}
  pdfImport(importId:string){return this.execute<PdfImportRecord>('pdfImport',{importId})}
  commitPdfImport(importId:string,expectedSignature:string){return this.execute<Identity>('commitPdfImport',{importId,expectedSignature})}
  async removePdfImport(importId:string){await this.execute('removePdfImport',{importId})}
  readImage(identity: Identity) { return this.execute<StoredImage>('readImage', identity) }
  readAttachment(identity: Identity) { return this.execute<{ base64: string }>('readAttachment', identity) }
  packExports() { return this.execute<{ entries: PackSummary[] }>('packExports') }
  packExport(packId: string) { return this.execute<PackInfo>('packExport', { packId }) }
  exportPack(pack: PreparedPack) { return this.execute<TextExportResult>('exportPack', pack) }
  retryPack(packId: string) { return this.execute<TextExportResult>('retryPack', { packId }) }
  async removePack(packId: string) { await this.execute('removePack', { packId }) }
  async choosePackImport() { return (await this.execute<{ entry: PackImportSummary | null }>('importPackFile')).entry }
  packImports() { return this.execute<{ entries: PackImportSummary[] }>('packImports') }
  async packImport(packId: string) {
    const record = await this.execute<PackImportRecord>('packImport', { packId })
    if (record.status === 'ready' && record.content !== null) try { validatePackContent(record.content, record.textName, record.assets) }
    catch (error) { return { ...record, status: 'failed' as const, error: humanStorageError(error) } }
    return record
  }
  packImportImage(packId: string, sourcePath: string) { return this.execute<StoredImage>('packImportImage', { packId, sourcePath }) }
  async commitPackImport(packId: string) {
    const record = await this.packImport(packId)
    if (record.status !== 'ready' && record.status !== 'imported') throw new Error(record.error || '请先重新核对附件包。')
    return this.execute<Document>('commitPackImport', { packId, expectedSignature: record.archiveDigest })
  }
  async removePackImport(packId: string) { await this.execute('removePackImport', { packId }) }
  async importImage(note: Identity) { return (await this.execute<{ image: ImageImport | null }>('importImage', note)).image }
  imageImports(note?: Identity) { return this.execute<{ entries: ImageImport[]; truncated: boolean; unreadable?: number }>('imageImports', note || { all: true }) }
  retryImage(imageId: string) { return this.execute<ImageImport>('retryImage', { imageId }) }
  imageImportPreview(imageId: string) { return this.execute<StoredImage>('imageImportPreview', { imageId }) }
  copyImage(source: Identity, target: Identity) { return this.execute<ImageImport>('copyImage', { ...target, sourceRootId: source.rootId, sourcePath: source.relativePath }) }
  write(identity: Identity, content: string, expectedSignature: string | null) { return this.execute<Document>('write', { ...identity, content, expectedSignature }) }
  async draft(identity: Identity) { return (await this.execute<{ draft: Draft | null }>('draft', identity)).draft }
  async saveDraft(draft: Draft) { await this.execute('saveDraft', draft) }
  async discardDraft(identity: Identity, revision: number) { await this.execute('discardDraft', { ...identity, revision }) }
  recoveries() { return this.execute<{ entries: RecoverySummary[]; truncated: boolean }>('recoveries') }
  recovery(recoveryId: string) { return this.execute<RecoveryRecord>('recovery', { recoveryId }) }
  copyRecovery(recoveryId: string, version: 'candidate' | 'original') { return this.execute<Document>('copyRecovery', { recoveryId, version }) }
  exportRecovery(recoveryId: string) { return this.execute<{ exported?: boolean; cancelled?: boolean }>('exportRecovery', { recoveryId }) }
  exportDocument(snapshot: TextExportSnapshot) { return this.execute<TextExportResult>('exportDocument', snapshot) }
  async chooseTextImport() { return (await this.execute<{ entry: FileImportSummary | null }>('importTextFile')).entry }
  fileImports() { return this.execute<{ entries: FileImportSummary[]; truncated: boolean }>('fileImports') }
  fileImport(importId: string) { return this.execute<FileImportRecord>('fileImport', { importId }) }
  commitFileImport(importId: string) { return this.execute<Document>('commitFileImport', { importId }) }
  incomingStatus() { return this.execute<IncomingStatus>('incomingStatus') }
  async acknowledgeIncoming(id = '', kind: 'text' | 'pack' | 'pdf' = 'text') { await this.execute('acknowledgeIncoming', kind === 'pack' ? { packId: id } : { importId: id,version:kind==='pdf'?'pdf':'' }) }
  async removeFileImport(importId: string) { await this.execute('removeFileImport', { importId }) }
}

interface PreviewPackImport extends PackImportRecord { archive?: string }
interface PreviewData { pdfImports?:Record<string,PdfImportRecord>; packImports?: Record<string, PreviewPackImport>; packTargets?: Record<string, { id: string; digest: string }>;  version: 1; documents: Record<string, Document>; drafts: Record<string, Draft>; libraries?: Library[]; recoveries?: Record<string, RecoveryRecord>; images?: Record<string, StoredImage>; imageImports?: Record<string, ImageImport & { candidate?: StoredImage }>; fileImports?: Record<string, FileImportRecord>; incomingError?: string; incomingErrorKind?: 'text' | 'pack' | 'pdf'; imageFaults?: Record<string, 'unconfirmed'>; writeFaults?: Record<string, 'nospace' | 'partial'>; attachments?: Record<string, { base64: string }>; packExports?: Record<string, PackInfo & { archive: string; digest: string; fingerprint: string }> }
const previewKey = 'longedit-mobile-preview-v1'
const recentKey = 'longedit-mobile-recent-v1'
function checkedRecent(value: unknown): Identity[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('最近记录格式无法读取')
  const seen = new Set<string>()
  return value.map(item => {
    if (typeof item?.rootId !== 'string' || !item.rootId || item.rootId.length > 512 || typeof item?.relativePath !== 'string') throw new Error('最近记录格式无法读取')
    validatePath(item.relativePath)
    const identity = { rootId: item.rootId, relativePath: item.relativePath }, key = identityKey(identity)
    if (seen.has(key)) throw new Error('最近记录格式无法读取')
    seen.add(key); return identity
  })
}
const digest = async (content: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))].map(byte => byte.toString(16).padStart(2, '0')).join('')

/** Explicit browser-only adapter. Native failures never fall back to this data. */
export class PreviewStorage implements Storage {
  readonly preview = true
  async readTextReading(){
    const raw=localStorage.getItem(readingBookmarkKey)
    if(raw===null)return{content:null,revision:'missing'}
    if(new TextEncoder().encode(raw).length>textReadingLimit)throw Error('阅读位置记录超过5 MiB，原记录仍保留。')
    const records=JSON.parse(raw);if(!records||typeof records!=='object'||Array.isArray(records))throw Error('阅读位置格式无法读取，原记录仍保留。')
    const content=JSON.stringify({version:1,records});return{content,revision:await digest(content)}
  }
  async writeTextReading(content:string,expectedRevision:string){
    const raw=localStorage.getItem(readingBookmarkKey),before=await this.readTextReading(),revision=await digest(content),value=JSON.parse(content)
    if(before.revision!==expectedRevision||localStorage.getItem(readingBookmarkKey)!==raw)throw Error('阅读位置已在别处变化，原记录仍保留，请重试。')
    if(value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records)||new TextEncoder().encode(content).length>textReadingLimit)throw Error('阅读位置格式无法核对，原记录仍保留。')
    localStorage.setItem(readingBookmarkKey,JSON.stringify(value.records));return{content,revision}
  }
  async systemAppearance(){return null}
  async applyAppearance(_dark:boolean,_surface?:'article'|'code'){}
  async copyText(content:string){if(new TextEncoder().encode(content).length>128*1024)throw Error('代码内容较长，未复制。');await navigator.clipboard.writeText(content)}
  async readPreferences(){
    const content=localStorage.getItem(preferencesKey)
    if(content!==null)parsePreferences(content)
    return{content,revision:content===null?'missing':await digest(content)}
  }
  async writePreferences(content:string,expectedRevision:string){
    parsePreferences(content)
    const before=await this.readPreferences(),revision=await digest(content)
    if(before.revision!==expectedRevision||localStorage.getItem(preferencesKey)!==before.content)throw Error('外观设置已在别处变化，请重新读取。')
    localStorage.setItem(preferencesKey,content)
    return{content,revision}
  }
  async readSourceReading(){
    const raw=localStorage.getItem(sourceReadingKey)
    if(raw===null)return{content:null,revision:'missing'}
    if(new TextEncoder().encode(raw).length>sourceReadingLimit)throw Error('阅读位置记录超过5 MiB，原记录仍保留。')
    const records=JSON.parse(raw);if(!records||typeof records!=='object'||Array.isArray(records))throw Error('阅读位置格式无法读取，原记录仍保留。')
    const content=JSON.stringify({version:1,records});return{content,revision:await digest(content)}
  }
  async writeSourceReading(content:string,expectedRevision:string){
    const raw=localStorage.getItem(sourceReadingKey),before=await this.readSourceReading(),revision=await digest(content),value=JSON.parse(content)
    if(before.revision!==expectedRevision||localStorage.getItem(sourceReadingKey)!==raw)throw Error('阅读位置已在别处变化，原记录仍保留，请重试。')
    if(value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records)||new TextEncoder().encode(content).length>sourceReadingLimit)throw Error('阅读位置格式无法核对，原记录仍保留。')
    localStorage.setItem(sourceReadingKey,JSON.stringify(value.records));return{content,revision}
  }
  async readPdfReading(){
    const raw=localStorage.getItem(pdfPointKey)
    if(raw===null)return{content:null,revision:'missing'}
    if(new TextEncoder().encode(raw).length>pdfReadingLimit)throw Error('阅读位置记录超过5 MiB，原记录仍保留。')
    const records=JSON.parse(raw);if(!records||typeof records!=='object'||Array.isArray(records))throw Error('阅读位置格式无法读取，原记录仍保留。')
    const content=JSON.stringify({version:1,records});return{content,revision:await digest(content)}
  }
  async writePdfReading(content:string,expectedRevision:string){
    // Browser preview keeps its existing map representation and makes one atomic write.
    const raw=localStorage.getItem(pdfPointKey),before=await this.readPdfReading(),revision=await digest(content),value=JSON.parse(content)
    if(before.revision!==expectedRevision||localStorage.getItem(pdfPointKey)!==raw)throw Error('阅读位置已在别处变化，原记录仍保留，请重试。')
    if(value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records)||new TextEncoder().encode(content).length>pdfReadingLimit)throw Error('阅读位置格式无法核对，原记录仍保留。')
    localStorage.setItem(pdfPointKey,JSON.stringify(value.records));return{content,revision}
  }
  async readPdfAnnotationRecovery(){const content=localStorage.getItem(pdfRecoveryKey);return{content,revision:content===null?'missing':await digest(content)}}
  async writePdfAnnotationRecovery(content:string,expectedRevision:string){
    const before=await this.readPdfAnnotationRecovery(),revision=await digest(content)
    if(before.revision!==expectedRevision||localStorage.getItem(pdfRecoveryKey)!==before.content)throw Error('批注恢复记录已在别处变化，当前输入仍保留，请重试。')
    localStorage.setItem(pdfRecoveryKey,content);return{content,revision}
  }
  async readPdfBookmarks(){
    const content=localStorage.getItem(pdfBookmarkStoreKey)
    return {content,revision:content===null?'missing':await digest(content)}
  }
  async writePdfBookmarks(content:string,expectedRevision:string){
    // Hashing yields: recheck the exact bytes synchronously immediately before the write.
    const before=await this.readPdfBookmarks(),revision=await digest(content)
    if(before.revision!==expectedRevision||localStorage.getItem(pdfBookmarkStoreKey)!==before.content)throw Error('书签已在别处变化。请重新读取；当前名称输入会保留。')
    try{localStorage.setItem(pdfBookmarkStoreKey,content)}catch{throw Error('书签未保存，本机空间可能不足；原记录仍保留，请重试。')}
    return {content,revision}
  }
  async recent() {
    const raw = localStorage.getItem(recentKey)
    if (raw !== null) return checkedRecent(JSON.parse(raw))
    return checkedRecent(Object.values(this.load().drafts).sort((a, b) => b.updated - a.updated || identityKey(a).localeCompare(identityKey(b))).slice(0, 12))
  }
  async remember(identity: Identity) {
    const entries = await this.recent()
    localStorage.setItem(recentKey, JSON.stringify(checkedRecent([identity, ...entries.filter(item => identityKey(item) !== identityKey(identity))].slice(0, 12))))
  }
  async importPdf(file?: File): Promise<Identity | null> {
    if (!file) return null
    if (!pdfSupported(file.name)) throw new Error('请选择 PDF 文件。')
    if (file.size > pdfLimit) throw new Error('当前支持 20 MiB 以内的 PDF。')
    const bytes = new Uint8Array(await file.arrayBuffer()); validatePdfBytes(bytes)
    const name = Array.from(file.name.slice(0,-4).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'').trim()).slice(0,40).join('') || '阅读资料'
    const identity = { rootId: 'local', relativePath: `${name}-导入-${crypto.randomUUID()}.pdf` }, data = this.load()
    ;(data.attachments ||= {})[identityKey(identity)] = { base64: bytesBase64(bytes) }; this.store(data)
    return identity
  }
  async pdfImports(){return{entries:Object.values(this.load().pdfImports||{}).map(({base64,...r})=>({...r,status:r.status==='preparing'?'failed' as const:r.status,error:r.status==='preparing'?'上次接收未完成，请重新分享。':r.error})).sort((a,b)=>b.created-a.created)}}
  async pdfImport(id:string){const record=this.load().pdfImports?.[id];if(!record)throw Error('没有找到这条 PDF 接收记录。');if(record.status==='ready'){if(!record.base64||record.base64.length>Math.ceil(pdfLimit/3)*4)throw Error('PDF 接收内容无法读取，记录仍保留。');const bytes=checkedReceivedPdf(base64Bytes(record.base64));if(bytes.length!==record.bytes||await hashBytes(bytes)!==record.digest)throw Error('PDF 接收内容核对失败，记录仍保留。')}return record}
  commitPdfImport(id:string,expected:string):Promise<Identity>{return this.packTask(async()=>{const r=await this.pdfImport(id);if(!/^[a-f0-9]{64}$/.test(expected)||r.digest!==expected||!['ready','imported'].includes(r.status))throw Error('请先重新核对这份 PDF，接收记录仍保留。');const identity={rootId:'local',relativePath:receivedPdfPath(r.name,id)},key=identityKey(identity),data=this.load(),current=data.pdfImports?.[id];if(JSON.stringify(current)!==JSON.stringify(r))throw Error('PDF 接收记录已变化，请重新核对。');const existing=data.attachments?.[key];if(r.localPath&&r.localPath!==identity.relativePath)throw Error('PDF 导入目标不匹配。');if(existing){if(!r.localPath||await hashBytes(base64Bytes(existing.base64))!==expected)throw Error('已有 PDF 已变化，未覆盖；接收记录仍保留。')}else{if(r.status==='imported')throw Error('已存入的 PDF 已移动或不存在，接收记录仍保留。');(data.attachments||={})[key]={base64:r.base64!}};data.pdfImports![id]={...r,status:'imported',localPath:identity.relativePath,incoming:false};this.store(data);return identity})}
  removePdfImport(id:string):Promise<void>{return this.packTask(async()=>{const data=this.load();if(!data.pdfImports?.[id])throw Error('没有找到这条 PDF 接收记录。');delete data.pdfImports[id];this.store(data)})}
  /** Browser fixture adapter only; the shipped native receiver consumes actual URI grants. */
  receivePdf(file:File,source:'open'|'share-file'='share-file'):Promise<PdfImportSummary>{return this.packTask(async()=>{const data=this.load();checkPdfIntakeCapacity(Object.values(data.pdfImports||{}),file.size);const id=crypto.randomUUID(),r:PdfImportRecord={id,name:receivedPdfName(file.name),source,created:Date.now(),bytes:0,status:'preparing',incoming:true,readable:true,error:'',digest:'',localPath:null,base64:null};try{const bytes=checkedReceivedPdf(new Uint8Array(await file.arrayBuffer()));r.bytes=bytes.length;r.digest=await hashBytes(bytes);r.base64=bytesBase64(bytes);r.status='ready'}catch(e){r.status='failed';r.error=humanStorageError(e)};(data.pdfImports||={})[id]=r;this.store(data);return r})}
  async readPdf(identity: Identity): Promise<PdfSource> {
    await this.accessible(identity.rootId); validatePath(identity.relativePath)
    if (!pdfSupported(identity.relativePath)) throw new Error('请选择 PDF 文件。')
    const asset = this.load().attachments?.[identityKey(identity)]
    if (!asset) throw new Error('NOT_FOUND: PDF 已移动或不存在。')
    if (asset.base64.length > Math.ceil(pdfLimit / 3) * 4) throw new Error('当前支持 20 MiB 以内的 PDF。')
    const bytes = base64Bytes(asset.base64); validatePdfBytes(bytes)
    return { ...identity, base64: asset.base64, signature: await hashBytes(bytes), bytes: bytes.length, modified: 0 }
  }
  private importing = new Set<string>()
  async readPdfAnnotations(identity: Identity): Promise<PdfAnnotationState> {
    const source = await this.readPdf(identity), sidecar = {...identity,relativePath:identity.relativePath+'.annotations.json'}
    const content = this.load().documents[identityKey(sidecar)]?.content ?? null
    return { content, revision:content === null ? 'missing' : await digest(content),sourceSignature:source.signature }
  }
  writePdfAnnotations(identity: Identity, content: string, expectedRevision: string, expectedSignature: string): Promise<PdfAnnotationState> {
    return this.packTask(async () => {
      if (identity.rootId !== 'local') throw new Error('来源文件夹中的 PDF 暂时仅可阅读；请先导入手机资料库再批注。')
      const state = await this.readPdfAnnotations(identity)
      if (state.revision !== expectedRevision || state.sourceSignature !== expectedSignature) throw new Error('CONFLICT: PDF 或批注已变化，本次输入仍保留，请先核对。')
      const source = await this.readPdf(identity), doc = parseAnnotations(content,{pdfFile:identity.relativePath.split('/').pop()!,size:source.bytes,modifiedAt:Math.floor(source.modified/1000)})
      doc.source.size=source.bytes; doc.source.modifiedAt=Math.floor(source.modified/1000)
      const value=serializeAnnotations(doc), signature=await digest(value), sidecar={...identity,relativePath:identity.relativePath+'.annotations.json'},data=this.load()
      // Recheck after hashing: a preview edit must not replace a newer sidecar.
      if ((data.documents[identityKey(sidecar)]?.content ?? null) !== state.content || data.attachments?.[identityKey(identity)]?.base64 !== source.base64) throw new Error('CONFLICT: PDF 或批注已变化，本次输入仍保留。')
      data.documents[identityKey(sidecar)]={...sidecar,content:value,signature,modified:Date.now()}; this.store(data)
      return {content:value,revision:signature,sourceSignature:source.signature}
    })
  }
  private importTail: Promise<unknown> = Promise.resolve()
  private packImportTail: Promise<unknown> = Promise.resolve()
  private load(): PreviewData {
    const raw = localStorage.getItem(previewKey)
    if (!raw) return { version: 1, documents: {}, drafts: {} }
    const data: PreviewData = JSON.parse(raw)
    if (data.version !== 1 || !data.documents || !data.drafts) throw new Error('浏览器预览数据无法读取，原记录仍保留')
    return data
  }
  private store(data: PreviewData) { localStorage.setItem(previewKey, JSON.stringify(data)) }
  private packTask<T>(action: () => Promise<T>) { const result = this.packImportTail.then(action); this.packImportTail = result.then(() => undefined, () => undefined); return result }
  private packSummary(record: PreviewPackImport): PackImportSummary { const { id, name, created, bytes, status, readable, error, localPath, count, incoming, source } = record; return { id, name, created, bytes, status, readable, error, localPath, count, incoming, source } }
  async packImports() { return { entries: Object.values(this.load().packImports || {}).map(record => this.packSummary(record)).sort((a, b) => b.created - a.created) } }
  choosePackImport(file?: File): Promise<PackImportSummary | null> {
    if (!file) return Promise.resolve(null)
    return this.packTask(async () => {
      let data = this.load()
      if (Object.keys(data.packImports || {}).length >= 6) throw new Error('已保留 6 份导入附件包，请先移除不需要的导入记录。')
      const id = crypto.randomUUID(), record: PreviewPackImport = { id, name: file.name.slice(0, 240), created: Date.now(), bytes: 0, count: 0, status: 'preparing', readable: true, error: '', localPath: null, content: null, textName: '', assets: [], archiveDigest: '' }
      ;(data.packImports ||= {})[id] = record; this.store(data)
      try {
        record.name = packImportName(file.name)
        if (file.size > packImportLimit) throw new Error('附件包支持 13 MiB 以内的文件。')
        const bytes = new Uint8Array(await file.arrayBuffer()); record.bytes = bytes.length; record.archiveDigest = await hashBytes(bytes); record.archive = bytesBase64(bytes)
        data = this.load(); data.packImports![id] = record; this.store(data)
        const parsed = await parseImportedPack(bytes)
        Object.assign(record, { status: 'ready', textName: parsed.textName, assets: parsed.assets, count: parsed.assets.length })
        data = this.load(); data.packImports![id] = record; this.store(data)
      } catch (error) { record.status = 'failed'; record.error = humanStorageError(error); data = this.load(); data.packImports![id] = record; this.store(data) }
      return this.packSummary(record)
    })
  }
  private async readImportPackage(record: PreviewPackImport) {
    if (!record.archive) throw new Error('上次附件包读取未完成，请重新选择源包；现有记录仍保留。')
    const bytes = base64Bytes(record.archive)
    if (bytes.length !== record.bytes || await hashBytes(bytes) !== record.archiveDigest) throw new Error('附件包核对失败，请重新选择源包；现有记录仍保留。')
    return parseImportedPack(bytes)
  }
  async packImport(id: string): Promise<PackImportRecord> {
    const record = this.load().packImports?.[id]
    if (!record) throw new Error('没有找到这份附件包导入记录。')
    const { archive: _archive, ...info } = record
    if (record.status === 'ready' || record.status === 'preparing') {
      try {
        const parsed = await this.readImportPackage(record)
        if (record.status === 'preparing') { const data = this.load(); Object.assign(data.packImports![id]!, { status: 'ready', textName: parsed.textName, assets: parsed.assets, count: parsed.assets.length }); this.store(data) }
        return { ...info, status: 'ready', textName: parsed.textName, assets: parsed.assets, count: parsed.assets.length, content: parsed.content }
      } catch (error) { return { ...info, status: 'failed', content: null, error: humanStorageError(error) } }
    }
    return { ...info, content: null }
  }
  async packImportImage(id: string, path: string) {
    const record = this.load().packImports?.[id]; if (!record) throw new Error('没有找到这份附件包。')
    const parsed = await this.readImportPackage(record), asset = parsed.assets.find(asset => asset.path === path), bytes = parsed.files.get(path)
    if (!asset?.width || !asset.height || !bytes) throw new Error('当前只预览 PNG、JPEG 和 WebP。')
    return { dataUrl: importedImageData(path, bytes), width: asset.width, height: asset.height, bytes: asset.bytes }
  }
  commitPackImport(id: string): Promise<Document> { return this.packTask(async () => {
    let record = this.load().packImports?.[id]; if (!record) throw new Error('没有找到这份附件包。')
    const target = packImportTarget(record.name, id, record.textName), identity = { rootId: 'local', relativePath: target.path }, key = identityKey(identity)
    if (record.localPath && record.localPath !== target.path) throw new Error('导入目标身份不匹配。')
    if (record.status === 'imported') return this.read(identity)
    if (record.status !== 'ready' && record.status !== 'preparing') throw new Error(record.error || '附件包还不能存入，请重新核对。')
    const parsed = await this.readImportPackage(record), contentDigest = await digest(parsed.content), prefix = target.folder + '/'
    let data = this.load(), existing = data.documents[key], owner = data.packTargets?.[target.folder]
    if (owner) {
      if (owner.id !== id || owner.digest !== record.archiveDigest || !existing || existing.content !== parsed.content || existing.signature !== contentDigest) throw new Error('目标笔记已有其他内容，完整附件包仍保留，不会覆盖。')
      for (const asset of parsed.assets) { const stored = data.attachments?.[identityKey({ rootId: 'local', relativePath: prefix + asset.path })]; if (!stored || await hashBytes(base64Bytes(stored.base64)) !== asset.digest) throw new Error('目标附件已有其他内容，完整附件包仍保留，不会覆盖。') }
    } else {
      const occupied = [...Object.keys(data.documents), ...Object.keys(data.images || {}), ...Object.keys(data.attachments || {})].some(key => { const [root, path] = JSON.parse(key); return root === 'local' && (path === target.folder || path.startsWith(prefix)) })
      if (occupied) throw new Error('目标文件夹已有其他内容，完整附件包仍保留，不会覆盖。')
      // One localStorage transaction publishes every file together. Android uses
      // a private pending directory and a single directory rename instead.
      data = this.load(); existing = { ...identity, content: parsed.content, signature: contentDigest, modified: Date.now() }; data.documents[key] = existing
      ;(data.packTargets ||= {})[target.folder] = { id, digest: record.archiveDigest }
      for (const asset of parsed.assets) {
        const bytes = parsed.files.get(asset.path)!, assetKey = identityKey({ rootId: 'local', relativePath: prefix + asset.path })
        ;(data.attachments ||= {})[assetKey] = { base64: bytesBase64(bytes) }
        if (asset.width && asset.height) (data.images ||= {})[assetKey] = { dataUrl: importedImageData(asset.path, bytes), width: asset.width, height: asset.height, bytes: asset.bytes }
      }
      this.store(data)
    }
    data = this.load(); record = data.packImports![id]!; record.status = 'imported'; record.localPath = target.path; this.store(data)
    return this.read(identity)
  }) }
  removePackImport(id: string): Promise<void> { return this.packTask(async () => { const data = this.load(); if (!data.packImports?.[id]) throw new Error('没有找到这份导入记录。'); delete data.packImports[id]; this.store(data) }) }
  private importSummary(record: FileImportRecord): FileImportSummary {
    const { content: _content, digest: _digest, ...summary } = record
    return summary.status === 'preparing' && !this.importing.has(summary.id) ? { ...summary, status: 'failed', error: '上次导入未完成，请重新选择文件；原文件未改动。' } : summary
  }
  async fileImports() {
    const entries = Object.values(this.load().fileImports || {}).sort((a, b) => b.created - a.created).map(record => this.importSummary(record))
    return { entries: entries.slice(0, 100), truncated: entries.length > 100 }
  }
  async fileImport(id: string): Promise<FileImportRecord> {
    const record = this.load().fileImports?.[id]
    if (!record) throw new Error('没有找到这条导入记录')
    if (record.status === 'ready' && (typeof record.content !== 'string' || new TextEncoder().encode(record.content).length !== record.bytes || await digest(record.content) !== record.digest)) throw new Error('导入内容核对失败，记录仍保留，请重新选择源文件。')
    return { ...structuredClone(record), ...this.importSummary(record) }
  }
  async chooseTextImport(file?: File): Promise<FileImportSummary | null> {
    if (!file) return null
    const data = this.load(), all = Object.values(data.fileImports || {})
    if (all.length >= 100 || all.filter(record => record.status === 'ready' || record.status === 'preparing').length >= 12) throw new Error('待导入文件或记录已达当前上限，请先存入笔记或清理不需要的导入记录。')
    const id = crypto.randomUUID(), record: FileImportRecord = { id, name: file.name.slice(0, 256) || '未命名文件', created: Date.now(), bytes: 0, status: 'preparing', readable: true, error: '', localPath: null, content: null, digest: null }
    ;(data.fileImports ||= {})[id] = record; this.store(data); this.importing.add(id)
    try {
      record.name = importedFileName(file.name, file.type)
      if (file.size > 4 * 1024 * 1024) throw new Error('当前支持 4 MiB 以内的文本，原文件未改动。')
      const bytes = new Uint8Array(await file.arrayBuffer()), content = decodeImportedText(bytes)
      Object.assign(record, { bytes: bytes.length, content, digest: await digest(content), status: 'ready' })
      const current = this.load(); current.fileImports![id] = record; this.store(current)
    } catch (error) {
      Object.assign(record, { status: 'failed', content: null, digest: null, error: humanStorageError(error) })
      const current = this.load(); current.fileImports![id] = record; this.store(current)
    } finally { this.importing.delete(id) }
    return this.importSummary(record)
  }
  commitFileImport(id: string): Promise<Document> {
    // A repeated receipt must reuse the protected target, including after a
    // successful file write whose following receipt could not be persisted.
    const operation = this.importTail.then(async () => {
      let record = await this.fileImport(id)
      const relativePath = importedCopyName(record.name, id), identity = { rootId: 'local', relativePath }
      if (record.localPath && record.localPath !== relativePath) throw new Error('导入副本位置不匹配，记录仍保留。')
      if (record.status === 'imported') return this.read(identity)
      if (record.status !== 'ready' || record.content === null) throw new Error('这份文件尚未完整导入，请重新选择源文件。')
      record.localPath = relativePath
      let current = this.load(); current.fileImports![id] = record; this.store(current)
      const existing = current.documents[identityKey(identity)]
      let document: Document
      if (existing) {
        if (existing.content !== record.content || existing.signature !== record.digest) throw new Error('CONFLICT: 目标副本已有其他内容，完整导入记录仍保留，不会覆盖。')
        document = { ...existing }
      } else document = await this.write(identity, record.content, null)
      current = this.load(); record = { ...record, status: 'imported', content: null, error: '' }; current.fileImports![id] = record; this.store(current)
      return document
    })
    this.importTail = operation.then(() => undefined, () => undefined)
    return operation
  }
  async removeFileImport(id: string) {
    await this.importTail
    if (this.importing.has(id)) throw new Error('文件仍在读取，请稍候')
    const data = this.load()
    if (!data.fileImports?.[id]) throw new Error('没有找到这条导入记录')
    delete data.fileImports[id]; this.store(data)
  }
  async incomingStatus(): Promise<IncomingStatus> { const data = this.load(); return { entries: (await this.fileImports()).entries.filter(record => record.incoming), packs: (await this.packImports()).entries.filter(record => record.incoming), pdfs: (await this.pdfImports()).entries.filter(record => record.incoming), error: data.incomingError || '', errorKind: data.incomingErrorKind } }
  async acknowledgeIncoming(id = '', kind: 'text' | 'pack' | 'pdf' = 'text') { const data = this.load(); if (id) { const record = kind === 'pack' ? data.packImports?.[id] : kind === 'pdf' ? data.pdfImports?.[id] : data.fileImports?.[id]; if (!record) throw new Error('没有找到这条导入记录'); record.incoming = false } else { delete data.incomingError; delete data.incomingErrorKind }; this.store(data) }
  async roots(): Promise<Library[]> { return [{ id: 'local', name: '手机资料库', external: false, available: true, writable: true }, ...(this.load().libraries ?? []).filter(root => root.id !== 'local')] }
  async choose(): Promise<Library | null> { throw new Error('选择手机文件夹需要在安卓应用中操作。浏览器可先新建笔记体验。') }
  async disconnect(rootId: string) {
    if (rootId === 'local') throw new Error('手机资料库不需要外部授权')
    const data = this.load(), root = data.libraries?.find(item => item.id === rootId)
    if (!root) throw new Error('没有找到这个资料库')
    root.available = false; root.writable = false; this.store(data)
  }
  private async accessible(rootId: string, write = false) {
    const root = (await this.roots()).find(item => item.id === rootId)
    if (!root?.available || (write && !root.writable)) throw new Error('PERMISSION: 资料库暂不可用或没有写入授权，请重新选择。')
  }
  async list(rootId: string, path: string) {
    await this.accessible(rootId)
    const data = this.load(), prefix = path ? `${path}/` : ''
    const found = new Map<string, Entry>()
    const items = [...Object.values(data.documents), ...Object.entries(data.images || {}).flatMap(([key, image]) => { const [imageRoot, relativePath] = JSON.parse(key); return [{ rootId: imageRoot, relativePath, content: '', modified: 0, imageBytes: image.bytes }] }), ...Object.entries(data.attachments || {}).map(([key, asset]) => { const [rootId, relativePath] = JSON.parse(key); return { rootId, relativePath, content: '', modified: 0, imageBytes: Math.floor(asset.base64.length * 3 / 4) - (asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0) } })]
    for (const doc of items.filter(doc => doc.rootId === rootId && doc.relativePath.startsWith(prefix))) {
      const tail = doc.relativePath.slice(prefix.length), name = tail.split('/')[0]
      if (!name || name.startsWith('.')) continue
      const directory = tail.includes('/')
      found.set(name, { name, relativePath: prefix + name, directory, modified: doc.modified, size: directory ? 0 : 'imageBytes' in doc ? Number(doc.imageBytes) : new TextEncoder().encode(doc.content).length })
    }
    const entries = [...found.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'zh-CN'))
    return { entries: entries.slice(0, 1000), truncated: entries.length > 1000 }
  }
  async read(identity: Identity) {
    await this.accessible(identity.rootId)
    const doc = this.load().documents[identityKey(identity)]
    if (!doc) throw new Error('NOT_FOUND: 文件已移动或不存在')
    return { ...doc }
  }
  async readImage(identity: Identity) {
    await this.accessible(identity.rootId)
    validatePath(identity.relativePath)
    const image = this.load().images?.[identityKey(identity)]
    if (!image) throw new Error('NOT_FOUND: 图片已移动或不存在')
    if (image.bytes > 2 * 1024 * 1024 || image.width * image.height > 8000000) throw new Error('TOO_LARGE: 图片超过当前阅读限制')
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image.dataUrl)) throw new Error('UNSUPPORTED: 图片格式暂不支持')
    return { ...image }
  }
  async readAttachment(identity: Identity) {
    await this.accessible(identity.rootId); validatePath(identity.relativePath)
    const data = this.load(), key = identityKey(identity)
    const base64 = data.attachments?.[key]?.base64 ?? data.images?.[key]?.dataUrl.split(',')[1] ?? (data.documents[key] ? bytesBase64(new TextEncoder().encode(data.documents[key].content)) : undefined)
    if (base64 === undefined) throw new Error('NOT_FOUND: 附件已移动或不存在')
    if (base64.length > 2800000 || base64Bytes(base64).length > 2 * 1024 * 1024) throw new Error('TOO_LARGE: 每个附件最多 2 MiB')
    return { base64 }
  }
  async packExports() {
    const entries = Object.values(this.load().packExports || {}).map(({ id, name, created, bytes, count }) => ({ id, name, created, bytes, count, readable: true })).sort((a, b) => b.created - a.created)
    return { entries }
  }
  async packExport(id: string): Promise<PackInfo> {
    const record = this.load().packExports?.[id]
    if (!record) throw new Error('没有找到这条附件包记录')
    const bytes = base64Bytes(record.archive)
    if (bytes.length !== record.bytes || await hashBytes(bytes) !== record.digest) throw new Error('附件包不完整或核对失败，记录仍保留。请回到原笔记重新准备。')
    const { archive: _archive, digest: _digest, fingerprint: _fingerprint, ...info } = record
    return structuredClone(info)
  }
  async exportPack(pack: PreparedPack) {
    const fingerprint = await digest(JSON.stringify(pack)), data = this.load(), existing = data.packExports?.[pack.packId]
    if (existing) { if (existing.fingerprint !== fingerprint) throw new Error('附件包记录不匹配，请关闭后重新准备。') }
    else {
      if (Object.keys(data.packExports || {}).length >= 6) throw new Error('已保留 6 份附件包，请先在「附件包导出记录」移除不需要的记录。')
      const archive = packArchive(pack), info = { id: pack.packId, name: packName(pack.relativePath), created: Date.now(), bytes: archive.length, count: pack.assets.length, readable: true, assets: pack.assets.map(({ sourcePath, archivePath, bytes }) => ({ sourcePath, archivePath, bytes })) }
      ;(data.packExports ||= {})[pack.packId] = { ...info, archive: bytesBase64(archive), digest: await hashBytes(archive), fingerprint }; this.store(data)
    }
    return this.retryPack(pack.packId)
  }
  async retryPack(id: string): Promise<TextExportResult> {
    const info = await this.packExport(id), record = this.load().packExports![id]!, bytes = base64Bytes(record.archive)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), anchor = document.createElement('a')
    try { anchor.href = url; anchor.download = info.name; anchor.click() } finally { setTimeout(() => URL.revokeObjectURL(url), 30000) }
    return { exported: true, retained: true }
  }
  async removePack(id: string) {
    const data = this.load(); if (!data.packExports?.[id]) throw new Error('没有找到这条附件包记录')
    delete data.packExports[id]; this.store(data)
  }
  private async stageImage(note: Identity, name: string, image: StoredImage) {
    validatePath(note.relativePath)
    if (!/\.md$/i.test(note.relativePath)) throw new Error('图片引用用于 Markdown 笔记')
    const data = this.load(), all = Object.values(data.imageImports || {})
    if (all.length >= 1000 || all.filter(item => item.candidate).length >= 12) throw new Error('图片导入记录或待恢复图片已达到当前上限，请先重试未完成项。')
    const record = { id: crypto.randomUUID(), rootId: note.rootId, notePath: note.relativePath, name, status: 'unconfirmed' as const, imagePath: null, width: image.width, height: image.height, bytes: image.bytes, created: Date.now(), error: '', attempts: 0, candidate: image }
    ;(data.imageImports ||= {})[record.id] = record; this.store(data)
    return this.retryImage(record.id)
  }
  async importImage(note: Identity, file?: File) {
    if (!file) throw new Error('浏览器预览需要选择一张图片')
    const bytes = new Uint8Array(await file.arrayBuffer()), info = imageFileInfo(bytes)
    const decoded = await createImageBitmap(new Blob([bytes], { type: info.mime })); const width = decoded.width, height = decoded.height; decoded.close()
    if (!width || !height || width > 8192 || height > 8192 || width * height > 8000000) throw new Error('图片分辨率超过当前限制')
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片无法读取')); reader.readAsDataURL(new Blob([bytes], { type: info.mime })) })
    return this.stageImage(note, file.name, { dataUrl, width, height, bytes: bytes.length })
  }
  async imageImports(note?: Identity) {
    const all = Object.values(this.load().imageImports || {}).filter(item => !note || item.rootId === note.rootId && item.notePath === note.relativePath).sort((a, b) => b.created - a.created)
    return { entries: all.slice(0, 25).map(({ candidate: _candidate, ...record }) => record), truncated: all.length > 25 }
  }
  async imageImportPreview(id: string) {
    const record = this.load().imageImports?.[id]
    if (!record) throw new Error('图片记录不存在')
    if (record.status !== 'ready' && !record.candidate) throw new Error('图片恢复数据不可读，请重新选择原图')
    return record.candidate || this.readImage({ rootId: record.rootId, relativePath: record.imagePath || '' })
  }
  async retryImage(id: string): Promise<ImageImport> {
    let data = this.load(), record = data.imageImports?.[id]
    if (!record) throw new Error('图片记录不存在')
    if (record.status === 'ready') { const { candidate: _candidate, ...ready } = record; return ready }
    if (!record.candidate) throw new Error('图片恢复数据不可读，请重新选择原图')
    try {
      await this.accessible(record.rootId, true)
      data = this.load(); record = data.imageImports![id]!
      if (record.attempts >= 5) throw new Error('此记录已尝试 5 次，请核对目标文件夹后重新选择原图')
      record.attempts++
      const folder = [...record.notePath.split('/').slice(0, -1), 'attachments'].join('/')
      if (data.documents[identityKey({ rootId: record.rootId, relativePath: folder })]) throw new Error('目标位置的 attachments 是文件，请改名后重试')
      const extension = record.candidate!.dataUrl.startsWith('data:image/jpeg;') ? 'jpg' : record.candidate!.dataUrl.startsWith('data:image/webp;') ? 'webp' : 'png'
      const imagePath = `${folder}/longedit-${crypto.randomUUID()}.${extension}`
      if (record.imagePath) record.previousPaths = [...(record.previousPaths || []), record.imagePath]
      record.imagePath = imagePath
      if (data.imageFaults?.[record.rootId] === 'unconfirmed') throw new Error('图片写入未确认，私有恢复副本仍保留；目标可能有未完成文件。')
      ;(data.images ||= {})[identityKey({ rootId: record.rootId, relativePath: imagePath })] = record.candidate!
      record.status = 'ready'; record.error = ''; delete record.candidate
      this.store(data)
    } catch (error) { record.error = humanStorageError(error); this.store(data) }
    const { candidate: _candidate, ...summary } = record; return summary
  }
  async copyImage(source: Identity, target: Identity) { return this.stageImage(target, source.relativePath.split('/').pop() || '图片', await this.readImage(source)) }
  async write(identity: Identity, content: string, expectedSignature: string | null) {
    await this.accessible(identity.rootId, true)
    validatePath(identity.relativePath)
    if (new TextEncoder().encode(content).length > 4 * 1024 * 1024) throw new Error('首版支持 4 MiB 以内的文本')
    const signature = await digest(content), data = this.load(), key = identityKey(identity)
    if ((data.documents[key]?.signature ?? null) !== expectedSignature) throw new Error('CONFLICT: 原文件已变化，草稿已保留')
    if (data.writeFaults?.[identity.rootId]) {
      const id = crypto.randomUUID(), old = data.documents[key]
      ;(data.recoveries ||= {})[id] = { ...identity, id, original: old?.content ?? null, candidate: content, created: Date.now(), hasOriginal: !!old, readable: true, libraryName: data.libraries?.find(root => root.id === identity.rootId)?.name || '手机资料库' }
      const partial = data.writeFaults[identity.rootId] === 'partial'
      if (partial && old) { const prefix = content.slice(0, 8); data.documents[key] = { ...old, content: prefix, signature: await digest(prefix), modified: Date.now() } }
      this.store(data)
      throw new Error(partial ? 'WRITE_FAILED: 保存未确认，草稿和已有恢复记录仍保留，请重试或存入手机资料库。' : 'WRITE_FAILED: 文件提供器报告空间不足，保存未确认；草稿和已有恢复记录仍保留，可另存到手机资料库。')
    }
    const doc: Document = { ...identity, content, signature, modified: Date.now() }
    data.documents[key] = doc
    this.store(data)
    return doc
  }
  async draft(identity: Identity) { return this.load().drafts[identityKey(identity)] ?? null }
  async saveDraft(draft: Draft) {
    const data = this.load(), key = identityKey(draft)
    if ((data.drafts[key]?.revision ?? -1) <= draft.revision) { data.drafts[key] = draft; this.store(data) }
  }
  async discardDraft(identity: Identity, revision: number) {
    const data = this.load(), key = identityKey(identity)
    if (data.drafts[key] && data.drafts[key].revision <= revision) { delete data.drafts[key]; this.store(data) }
  }
  async recoveries() {
    const data = this.load(), all = Object.values(data.recoveries ?? {}).sort((a, b) => b.created - a.created)
    return { entries: all.slice(0, 25).map(({ id, relativePath, created, hasOriginal, readable, rootId, libraryName, purpose }) => ({ id, relativePath, created, hasOriginal, readable, purpose, libraryName: libraryName || data.libraries?.find(root => root.id === rootId)?.name || (rootId === 'local' ? '手机资料库' : '来源文件夹') })), truncated: all.length > 25 }
  }
  async recovery(id: string) {
    const record = this.load().recoveries?.[id]
    if (!record) throw new Error('恢复记录不存在，当前文件不会改动。')
    return structuredClone(record)
  }
  async exportDocument(snapshot: TextExportSnapshot): Promise<TextExportResult> {
    validatePath(snapshot.relativePath)
    if (new TextEncoder().encode(snapshot.content).length > 4 * 1024 * 1024) throw new Error('导出支持 4 MiB 以内的文本')
    const data = this.load(), old = data.recoveries?.[snapshot.recoveryId]
    if (old && (old.purpose !== 'text-export' || old.rootId !== snapshot.rootId || old.relativePath !== snapshot.relativePath || old.candidate !== snapshot.content)) throw new Error('导出记录不匹配，请关闭面板后重新导出')
    ;(data.recoveries ||= {})[snapshot.recoveryId] = old || { id: snapshot.recoveryId, rootId: snapshot.rootId, relativePath: snapshot.relativePath, candidate: snapshot.content, original: null, purpose: 'text-export', created: Date.now(), hasOriginal: false, readable: true }
    this.store(data)
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([snapshot.content], { type: /\.json$/i.test(snapshot.relativePath) ? 'application/json;charset=utf-8' : /\.md$/i.test(snapshot.relativePath) ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }))
    try { link.href = url; link.download = textExportName(snapshot.relativePath); link.click() }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000) }
    // Only clear this export snapshot after download initiation. This is not a
    // browser filesystem verification; the UI explicitly describes that limit.
    try { const current = this.load(); delete current.recoveries![snapshot.recoveryId]; this.store(current); return { exported: true } }
    catch { return { exported: true, retained: true } }
  }
  async copyRecovery(id: string, version: 'candidate' | 'original') {
    const record = await this.recovery(id), content = version === 'original' ? record.original : record.candidate
    if (content === null) throw new Error('这条新建记录没有原文版本')
    const relativePath = localCopyName(record.relativePath, version === 'original' ? '原文恢复' : '草稿恢复')
    return this.write({ rootId: 'local', relativePath }, content, null)
  }
  async exportRecovery(id: string) {
    const record = await this.recovery(id), link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'longedit-write-recovery', version: 1, ...record }, null, 2)], { type: 'application/json' }))
    try { link.href = url; link.download = `Long编辑-保存恢复-${id}.json`; link.click() }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000) }
    return { exported: true }
  }
}

export const createStorage = (): Storage => isTauri() ? new AndroidStorage() : new PreviewStorage()
