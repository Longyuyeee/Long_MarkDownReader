import { readWorkSessions, workSessionKey, type WorkSession, type SessionTab } from '../utils/workSessions'
import { exportableWorkSession, materializeWorkSession, validatePortableWorkSession, type PortableWorkSession } from '../utils/portableWorkSession'
import { sameWorkspacePath } from '../utils/savedCollections'

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export async function portableSessionFingerprint(bundle: PortableWorkSession): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(validatePortableWorkSession(bundle)))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value=>value.toString(16).padStart(2,'0')).join('')
}
export function availableSessionName(name: string, sessions: WorkSession[]): string {
  const used = new Set(sessions.map(session=>session.name.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  for(let index=1;index<10000;index++) {
    const suffix=index===1?'（导入）':`（导入 ${index}）`, next=[...name].slice(0,60-[...suffix].length).join('')+suffix
    if(!used.has(next.toLowerCase()))return next
  }
  throw Error('同名现场过多，请修改名称')
}
export function importWorkSessionRecord(storage: StoragePort, session: WorkSession, fingerprint: string): { entry: WorkSession; duplicate: boolean } {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw Error('现场来源校验无效，请重新选择文件')
  // Re-read after file dialogs/preflight. A stale preview never overwrites the
  // current list, corrupt records or a concurrent rename in another window.
  const current=readWorkSessions(storage,session.libraryRoot)
  const duplicate=current.find(item=>item.importFingerprint===fingerprint)
  if(duplicate)return {entry:duplicate,duplicate:true}
  const checked=materializeWorkSession(exportableWorkSession(session),session.libraryRoot,session.id,session.name,fingerprint)
  if(current.length>=32)throw Error('最多保存 32 个工作现场，请先整理已有记录')
  if(current.some(item=>item.id===checked.id))throw Error('现场标识冲突，请重新导入')
  if(current.some(item=>item.name.toLowerCase()===checked.name.toLowerCase()))throw Error('已有同名工作现场，请修改名称后重试')
  storage.setItem(workSessionKey(session.libraryRoot),JSON.stringify([checked,...current]))
  return {entry:checked,duplicate:false}
}
export function repairWorkSessionRecord(storage: StoragePort, root: string, expected: WorkSession, replacement: WorkSession): WorkSession {
  if(replacement.id!==expected.id||!sameWorkspacePath(root,replacement.libraryRoot))throw Error('现场目标已变化，修复已取消')
  const current=readWorkSessions(storage,root), found=current.find(item=>item.id===expected.id)
  if(!found||JSON.stringify(found)!==JSON.stringify(expected))throw Error('工作现场已变化，请重新核对后再修复')
  const checked=materializeWorkSession(exportableWorkSession(replacement),root,found.id,found.name,found.importFingerprint)
  storage.setItem(workSessionKey(root),JSON.stringify(current.map(item=>item.id===found.id?checked:item)))
  return checked
}
export function planWorkSessionRestore<T extends { id:string; path:string; isDirty:boolean }>(current: T[], activeId: string | null, restored: WorkSession, localDirtyPaths: readonly string[] = []) {
  const protectedTabs=current.filter(tab=>tab.isDirty||localDirtyPaths.some(path=>sameWorkspacePath(path,tab.path)))
  const imported: SessionTab[]=restored.tabs.filter(tab=>!protectedTabs.some(dirty=>sameWorkspacePath(dirty.path,tab.path)))
  const tabs:(T|SessionTab)[]=[...imported,...protectedTabs]
  // Keep the visible dirty model active. Changing a scene must not unmount a
  // specialized editor whose draft is held by its existing live component.
  const protectedActive=protectedTabs.find(tab=>tab.id===activeId)
  const activeTabId=protectedActive?.id||tabs.find(tab=>restored.activeTabId&&sameWorkspacePath(tab.path,restored.activeTabId))?.id||tabs[0]?.id||null
  const cleanPaths=imported.map(tab=>tab.path)
  return {tabs,activeTabId,cleanPaths,protectedTabs}
}
