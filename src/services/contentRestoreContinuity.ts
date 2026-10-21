import { useAppStore, type TabInfo } from '../store/app'
import { captureWorkSession, libraryTabsKey, readWorkSessions } from '../utils/workSessions'
import { availableWorkSession, exportableWorkSession, materializeWorkSession, selectedPortableSession, portableSessionPaths, type PortableWorkSession, type SessionPreflight } from '../utils/portableWorkSession'
import { sameWorkspacePath } from '../utils/savedCollections'
import { availableSessionName, importWorkSessionRecord, portableSessionFingerprint, planWorkSessionRestore } from './workSessionTransfer'
import { captureWorkspaceViewStates, stageWorkspaceViewStates } from './workspaceViewState'
import { readWorkspaceReference, writeWorkspaceReference } from './workspaceReference'
import { snapshotSearchSession, restoreSearchSession } from '../composables/useSearchReturn'
import { dirtyDocumentPaths, pendingDocumentSaves, snapshotWindowDrafts, windowDraftActivity, windowDraftCount } from './windowDrafts'
import { hasPendingMainTextSave } from '../utils/mainTextSaveOwnership'

export function captureContentWorkSession(root: string, store = useAppStore()): PortableWorkSession | undefined {
  snapshotWindowDrafts()
  const current = sameWorkspacePath(root, store.libraryPath)
  const saved = current ? null : JSON.parse(localStorage.getItem(libraryTabsKey(root)) || 'null')
  const session = captureWorkSession(root, current ? store.tabs : saved?.tabs, current ? store.activeTabId : saved?.activeTabId, '备份时的工作现场')
  if (!session.tabs.length) return undefined
  session.views = captureWorkspaceViewStates(session.tabs.map(tab=>tab.path))
  session.search = snapshotSearchSession(root)
  session.reference = readWorkspaceReference(root)
  return exportableWorkSession(session)
}

const pending = (store: ReturnType<typeof useAppStore>) => pendingDocumentSaves.value || store.tabs.some(tab=>hasPendingMainTextSave(tab.path))
const dirty = (store: ReturnType<typeof useAppStore>) => windowDraftCount.value || dirtyDocumentPaths().length || store.tabs.some(tab=>tab.isDirty)

// Store the repairable full scene first. Opening is separate from saving a
// record, and must never require an automatic save/discard of a live editor.
export async function continueContentWorkSession(bundle: PortableWorkSession, frame: SessionPreflight, paths: string[], includeContext: boolean, sourceRoot: string, isLive: () => boolean, store = useAppStore()) {
  const assertLive = () => { if (!isLive() || !sameWorkspacePath(store.libraryPath, sourceRoot)) throw Error('资料库或恢复窗口已变化，请重新接续') }
  assertLive()
  const fingerprint = await portableSessionFingerprint(bundle)
  assertLive()
  const full = materializeWorkSession(includeContext ? bundle : {...bundle,search:undefined,reference:undefined}, frame.libraryRoot, crypto.randomUUID(), availableSessionName(bundle.name, readWorkSessions(localStorage, frame.libraryRoot)), fingerprint)
  const chosen = selectedPortableSession(bundle, paths, includeContext), requested = new Set(portableSessionPaths(chosen).map(path=>path.toLowerCase()))
  const ready = availableWorkSession(materializeWorkSession(chosen, frame.libraryRoot, full.id, full.name), {
    ...frame, files: frame.files.filter(file=>requested.has(file.relativePath.toLowerCase()))
  }).session
  if (!ready.tabs.length) throw Error('请至少选择一份可用文件；缺失项可重新定位，也可稍后接续')
  const record = importWorkSessionRecord(localStorage, full, fingerprint).entry
  snapshotWindowDrafts()
  const switching = !sameWorkspacePath(sourceRoot, frame.libraryRoot)
  if (pending(store) || (switching && dirty(store))) return {record,continued:false}
  const activity = windowDraftActivity.value
  const assertUnchanged = () => {
    assertLive(); snapshotWindowDrafts()
    if (windowDraftActivity.value !== activity || pending(store) || (switching && dirty(store))) throw Error('接续期间产生了新的编辑，已保留当前文稿和现场记录，请稍后继续')
  }
  const plan = planWorkSessionRestore(switching ? [] : store.tabs, switching ? null : store.activeTabId, ready, dirtyDocumentPaths())
  const root = frame.libraryRoot, tabKey = libraryTabsKey(root), oldTabs = localStorage.getItem(tabKey)
  const oldState = oldTabs ? JSON.parse(oldTabs) : {}
  const oldReference = readWorkspaceReference(root), oldSearch = snapshotSearchSession(root)
  const undoViews = stageWorkspaceViewStates(ready.views || {},plan.cleanPaths)
  try {
    if (includeContext) { writeWorkspaceReference(root,ready.reference); restoreSearchSession(root,ready.search) }
    const tabs = plan.tabs.filter(tab=>!('external' in tab&&tab.external)).map(tab=>({id:tab.id,path:tab.path,title:tab.title,isDirty:false,...(tab.pinned?{pinned:true}:{})}))
    localStorage.setItem(tabKey,JSON.stringify({tabs,activeTabId:plan.activeTabId,recentFiles:oldState.recentFiles || [],starredFiles:oldState.starredFiles || []}))
    assertUnchanged()
    if (switching) await store.updateConfig({activeLibraryPath:root},assertUnchanged)
    else { store.tabs=plan.tabs as TabInfo[];store.activeTabId=plan.activeTabId }
  } catch (cause) {
    let incomplete = false
    for (const undo of [undoViews,()=>writeWorkspaceReference(root,oldReference),()=>restoreSearchSession(root,oldSearch),()=>{if(oldTabs===null)localStorage.removeItem(tabKey);else localStorage.setItem(tabKey,oldTabs)}]) try { undo() } catch { incomplete=true }
    throw Error(`${String(cause)}${incomplete?'；部分阅读设置未能还原，请核对。':''}`)
  }
  return {record,continued:true}
}
