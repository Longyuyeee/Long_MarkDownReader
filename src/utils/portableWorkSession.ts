import type { WorkSession, SessionTab } from './workSessions'

export const MAX_SESSION_FILES = 128
export const MAX_SESSION_BUNDLE_BYTES = 256 * 1024
export interface PortableView {
  scrollTop: number; scrollLeft: number; zoom?: number; frozenColumns?: number; panX?: number; panY?: number
  fitWidth?: boolean; sidebarOpen?: boolean; panelOpen?: boolean; section?: string; sidebarTab?: string; mode?: string
}
export interface PortableSessionFile { relativePath: string; pinned?: boolean; view?: PortableView }
export interface PortableSearch { query: string; types: string[]; scroll: number; loadedFiles?: number; sort?: 'relevance' | 'modified' }
export interface PortableReference { relativePath: string; query: string; page?: number; annotationId?: string }
export interface PortableWorkSession {
  kind: 'longedit-work-session'; schemaVersion: 1; name: string; savedAt: number
  files: PortableSessionFile[]; activePath?: string; search?: PortableSearch; reference?: PortableReference
}
export interface SessionFileCheck { relativePath: string; state: 'ready' | 'missing' | 'unavailable' | 'unsupported'; path?: string; reason?: string }
export interface SessionPreflight { libraryRoot: string; files: SessionFileCheck[] }
const key = (value: string) => value.toLowerCase()
const absolute = (value: string) => value.replace(/^\\\\\?\\UNC\\/i, '//').replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '')
const object = (value: unknown, keys: string[], context: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(item => !keys.includes(item))) throw Error(`${context}含有不支持的字段或格式`)
  return value as Record<string, any>
}
const boundedString = (value: unknown, max: number, context: string, allowEmpty = true): string => {
  if (typeof value !== 'string' || [...value].length > max || (!allowEmpty && !value.trim()) || /[\x00-\x1f\x7f-\x9f]/.test(value)) throw Error(`${context}为空、过长或含控制字符`)
  return value
}
const number = (value: unknown, min: number, max: number, context: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`${context}超出有效范围`)
  return value
}
export function sessionRelativePath(value: unknown): string {
  const text = boundedString(value, 1024, '文件相对路径', false)
  const parts = text.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\:*?"<>|]/.test(part) || /[ .]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
    || ['.longedit', '.git', '.misty', '.history', '.misty_order.json'].includes(key(part)))) throw Error('文件位置必须是资料库内的普通相对路径，不能越界或指向私有目录')
  return text
}
export function relativeSessionPath(root: string, fullPath: string): string {
  const base = absolute(root), full = absolute(fullPath)
  if (!base || !key(full).startsWith(key(base) + '/')) throw Error('现场文件不属于所选资料库')
  return sessionRelativePath(full.slice(base.length + 1))
}
export const resolveSessionPath = (root: string, relative: string) => `${absolute(root)}/${sessionRelativePath(relative)}`

export function validatePortableView(input: unknown): PortableView {
  const view = object(input, ['scrollTop','scrollLeft','zoom','frozenColumns','panX','panY','fitWidth','sidebarOpen','panelOpen','section','sidebarTab','mode'], '阅读位置')
  const result: PortableView = { scrollTop: number(view.scrollTop, 0, 1e9, '纵向位置'), scrollLeft: number(view.scrollLeft, 0, 1e9, '横向位置') }
  for (const field of ['zoom','frozenColumns','panX','panY'] as const) if (view[field] !== undefined) result[field] = number(view[field], field === 'zoom' ? .05 : field.startsWith('pan') ? -1e7 : 0, field === 'zoom' ? 16 : field === 'frozenColumns' ? 1000 : 1e7, '阅读参数')
  for (const field of ['fitWidth','sidebarOpen','panelOpen'] as const) if (view[field] !== undefined) { if (typeof view[field] !== 'boolean') throw Error('阅读开关格式无效'); result[field] = view[field] }
  for (const field of ['section','sidebarTab','mode'] as const) if (view[field] !== undefined) {
    const value = boundedString(view[field], 200, '视图位置')
    // Document-internal page IDs can contain separators/colons. They are never
    // filesystem inputs; reject absolute/escaping paths, not valid internal IDs.
    if (/^(?:[a-z]:|[\\/])|:\/\//i.test(value) || value.split(/[\\/]/).includes('..')) throw Error('视图位置不能包含文件系统路径')
    result[field] = value
  }
  return result
}
export function validatePortableWorkSession(input: unknown): PortableWorkSession {
  const item = object(input, ['kind','schemaVersion','name','savedAt','files','activePath','search','reference'], '现场文件')
  if (item.kind !== 'longedit-work-session' || item.schemaVersion !== 1) throw Error('这不是支持的 Long编辑工作现场文件，原记录未改变')
  const name = boundedString(item.name, 60, '现场名称', false).trim()
  const savedAt = number(item.savedAt, 0, Number.MAX_SAFE_INTEGER, '保存时间')
  if (!Number.isSafeInteger(savedAt)) throw Error('保存时间格式无效')
  if (!Array.isArray(item.files) || item.files.length < 1 || item.files.length > MAX_SESSION_FILES) throw Error(`现场需包含 1–${MAX_SESSION_FILES} 份文件`)
  const seen = new Set<string>()
  const files: PortableSessionFile[] = item.files.map((raw: unknown) => {
    const entry = object(raw, ['relativePath','pinned','view'], '现场文件项'), relativePath = sessionRelativePath(entry.relativePath)
    if (seen.has(key(relativePath))) throw Error('现场含重复文件位置')
    seen.add(key(relativePath))
    if (entry.pinned !== undefined && typeof entry.pinned !== 'boolean') throw Error('固定标签格式无效')
    return { relativePath, ...(entry.pinned ? { pinned:true } : {}), ...(entry.view === undefined ? {} : { view:validatePortableView(entry.view) }) }
  })
  const result: PortableWorkSession = { kind:'longedit-work-session', schemaVersion:1, name, savedAt, files }
  if (item.activePath !== undefined) { const active = sessionRelativePath(item.activePath); if (!seen.has(key(active))) throw Error('活动文件不在现场清单中'); result.activePath = active }
  if (item.search !== undefined) {
    const search = object(item.search, ['query','types','scroll','loadedFiles','sort'], '搜索条件')
    if (!Array.isArray(search.types) || search.types.length > 8 || search.types.some((type: unknown) => typeof type !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(type))) throw Error('搜索格式筛选无效')
    if (search.sort !== undefined && !['relevance','modified'].includes(search.sort)) throw Error('搜索排序无效')
    result.search = { query:boundedString(search.query, 500, '搜索词'), types:[...new Set<string>(search.types)], scroll:number(search.scroll, 0, 1e9, '搜索位置'),
      ...(search.loadedFiles === undefined ? {} : { loadedFiles:number(search.loadedFiles, 0, 10000, '搜索深度') }), ...(search.sort ? { sort:search.sort } : {}) }
    if (result.search.loadedFiles !== undefined && !Number.isInteger(result.search.loadedFiles)) throw Error('搜索深度必须为整数')
  }
  if (item.reference !== undefined) {
    const reference = object(item.reference, ['relativePath','query','page','annotationId'], '参考位置')
    result.reference = { relativePath:sessionRelativePath(reference.relativePath), query:boundedString(reference.query, 500, '参考搜索词') }
    if (reference.page !== undefined) { result.reference.page = number(reference.page, 1, 100000, '参考页码'); if (!Number.isInteger(result.reference.page)) throw Error('参考页码必须为整数') }
    if (reference.annotationId !== undefined) result.reference.annotationId = boundedString(reference.annotationId, 200, '批注位置', false)
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_SESSION_BUNDLE_BYTES) throw Error('现场文件超过 256 KiB，请拆分现场')
  return result
}

// Deliberately project a whitelist. Search result keys contain snippets and old
// absolute paths; arbitrary fields from local records must never reach exports.
export function exportableWorkSession(session: WorkSession, includeContext = true): PortableWorkSession {
  const files = session.tabs.map(tab => {
    const relativePath = relativeSessionPath(session.libraryRoot, tab.path), source = session.views?.[tab.path] as Record<string, unknown> | undefined
    let view: PortableView | undefined
    if (source) {
      const allowed = Object.fromEntries(Object.entries(source).filter(([field]) => ['scrollTop','scrollLeft','zoom','frozenColumns','panX','panY','fitWidth','sidebarOpen','panelOpen','section','sidebarTab','mode'].includes(field)))
      view = validatePortableView(allowed)
    }
    return { relativePath, ...(tab.pinned ? {pinned:true} : {}), ...(view ? { view } : {}) }
  })
  const activePath = session.activeTabId ? relativeSessionPath(session.libraryRoot, session.activeTabId) : undefined
  const source = session.search
  return validatePortableWorkSession({ kind:'longedit-work-session', schemaVersion:1, name:session.name, savedAt:session.savedAt, files,
    ...(activePath ? {activePath} : {}), ...(includeContext && source ? {search:{ query:source.query, types:source.types, scroll:source.scroll, loadedFiles:source.loadedFiles, sort:source.sort }} : {}),
    ...(includeContext && session.reference ? {reference:{ relativePath:relativeSessionPath(session.libraryRoot, session.reference.path), query:session.reference.query, page:session.reference.page, annotationId:session.reference.annotationId }} : {}) })
}
export function portableSessionPaths(bundle: PortableWorkSession): string[] {
  return [...new Map([...bundle.files.map(file=>file.relativePath), ...(bundle.reference ? [bundle.reference.relativePath] : [])].map(value=>[key(value), value])).values()]
}
export function materializeWorkSession(bundle: PortableWorkSession, root: string, id: string, name = bundle.name, fingerprint?: string): WorkSession {
  const checked = validatePortableWorkSession(bundle)
  const checkedName=boundedString(name,60,'现场名称',false).trim(),checkedId=boundedString(id,200,'现场标识',false)
  const tabs: SessionTab[] = checked.files.map(file => { const path=resolveSessionPath(root,file.relativePath); return {id:path,path,title:file.relativePath.split('/').pop()!,isDirty:false,...(file.pinned ? {pinned:true} : {})} })
  return {version:1,id:checkedId,name:checkedName,libraryRoot:root,tabs,activeTabId:checked.activePath ? resolveSessionPath(root,checked.activePath) : tabs[0]?.id || null,savedAt:checked.savedAt,
    ...(fingerprint ? {importFingerprint:fingerprint} : {}),
    ...(checked.search ? {search:{...checked.search,types:[...checked.search.types],selected:''}} : {}),
    ...(checked.reference ? {reference:{path:resolveSessionPath(root,checked.reference.relativePath),title:checked.reference.relativePath.split('/').pop()!,query:checked.reference.query,page:checked.reference.page,annotationId:checked.reference.annotationId}} : {}),
    views:Object.fromEntries(checked.files.filter(file=>file.view).map(file=>[resolveSessionPath(root,file.relativePath), {...file.view!}])) }
}
export function remapPortableFile(bundle: PortableWorkSession, from: string, to: string): PortableWorkSession {
  sessionRelativePath(from); sessionRelativePath(to)
  return validatePortableWorkSession({...bundle,files:bundle.files.map(file=>key(file.relativePath)===key(from)?{...file,relativePath:to}:file),
    ...(bundle.activePath ? {activePath:key(bundle.activePath)===key(from)?to:bundle.activePath}:{}),
    ...(bundle.reference ? {reference:{...bundle.reference,relativePath:key(bundle.reference.relativePath)===key(from)?to:bundle.reference.relativePath}}:{})})
}

export function availableWorkSession(session: WorkSession, preflight: SessionPreflight): { session: WorkSession; missing: SessionFileCheck[] } {
  if (key(absolute(preflight.libraryRoot)) !== key(absolute(session.libraryRoot))) throw Error('资料库已变化，请重新核对现场')
  const bundle = exportableWorkSession(session), checks = new Map(preflight.files.map(file=>[key(sessionRelativePath(file.relativePath)),file]))
  if (checks.size !== preflight.files.length || checks.size !== portableSessionPaths(bundle).length || portableSessionPaths(bundle).some(file=>!checks.has(key(file)))) throw Error('现场预检清单不完整或重复')
  for(const checked of checks.values()) if(checked.state==='ready') {
    if(!checked.path)throw Error('预检缺少真实文件位置')
    if(key(relativeSessionPath(preflight.libraryRoot,checked.path))!==key(checked.relativePath))throw Error('预检文件身份不一致，请重新核对')
  }
  const tabs = session.tabs.flatMap(tab=>{
    const checked=checks.get(key(relativeSessionPath(session.libraryRoot,tab.path)))!
    if (checked.state!=='ready') return []
    const path=checked.path!
    return [{...tab,id:path,path,title:path.replace(/\\/g,'/').split('/').pop()!,isDirty:false as const}]
  })
  const reference = bundle.reference ? checks.get(key(bundle.reference.relativePath)) : undefined
  if (reference?.state==='ready' && reference.path) relativeSessionPath(preflight.libraryRoot,reference.path)
  const active = session.activeTabId ? checks.get(key(relativeSessionPath(session.libraryRoot,session.activeTabId))) : undefined
  return {session:{...session,tabs,activeTabId:active?.state==='ready'?active.path || tabs[0]?.id || null:tabs[0]?.id || null,
    reference:reference?.state==='ready'&&reference.path&&session.reference ? {...session.reference,path:reference.path}:undefined,
    views:Object.fromEntries(session.tabs.flatMap(tab=>{const check=checks.get(key(relativeSessionPath(session.libraryRoot,tab.path))),view=session.views?.[tab.path];return view&&check?.state==='ready'&&check.path?[[check.path,view]]:[]}))},
    missing:preflight.files.filter(file=>file.state!=='ready')}
}
