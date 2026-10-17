<template>
  <section class="work-session-bar" aria-label="工作现场">
    <div class="session-heading"><strong>接着上次的工作</strong><small>自动记住文件、阅读位置和参考资料</small></div>
    <div class="session-controls">
      <label for="work-session-choice">工作现场</label>
      <select id="work-session-choice" v-model="selected" title="右键或 Shift+F10 重命名、删除命名记录" @contextmenu.prevent="showMenu" @keydown.shift.f10.prevent="showMenu"><option value="">上次工作 · 自动记住</option><option v-for="item in sessions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
      <n-button size="small" type="primary" :loading="busy" :disabled="busy" @click="openSession">继续工作</n-button>
      <n-button size="small" :disabled="busy" @click="naming = true">命名保存…</n-button>
      <n-button size="small" :disabled="busy" :aria-expanded="menuOpen" aria-haspopup="menu" @click="showMenu">管理现场</n-button>
    </div>
    <form v-if="naming" class="session-controls" @submit.prevent="saveSession">
      <label for="work-session-name">名称</label><input id="work-session-name" v-model="name" maxlength="60" autofocus />
      <n-button size="small" attr-type="submit">保存现场</n-button><n-button size="small" @click="naming = false">取消</n-button>
    </form>
    <p role="status" :class="{ error: failed }">{{ notice || '自动记住打开的文件；命名保存不写入正文。' }}</p>
    <n-dropdown trigger="manual" :show="menuOpen" :x="menuX" :y="menuY" :options="menuOptions" @clickoutside="menuOpen = false" @select="manageSession" />
    <WorkSessionTransferDialog v-if="transfer" :mode="transfer.mode" :bundle="transfer.bundle" :root="transfer.root" :expected="transfer.expected" :restore="restoreFromBundle" @close="transfer = null" @imported="imported" @exported="notice = '工作现场已导出；原文和现有记录保持不变。'; failed = false" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { confirmAppAction, promptAppAction } from '../services/appDialog'
import { useAppStore, type TabInfo } from '../store/app'
import { sameWorkspacePath } from '../utils/savedCollections'
import { hasPendingMainTextSave } from '../utils/mainTextSaveOwnership'
import { snapshotSearchSession, restoreSearchSession } from '../composables/useSearchReturn'
import { captureWorkspaceViewStates, stageWorkspaceViewStates } from '../services/workspaceViewState'
import { readWorkspaceReference, writeWorkspaceReference } from '../services/workspaceReference'
import { captureWorkSession, readWorkSessions, saveWorkSession, editWorkSession, libraryTabsKey, type WorkSession } from '../utils/workSessions'
import { availableWorkSession, exportableWorkSession, localSessionPaths, materializeWorkSession, validatePortableWorkSession, type PortableWorkSession, type SessionPreflight } from '../utils/portableWorkSession'
import { planWorkSessionRestore, repairWorkSessionRecord } from '../services/workSessionTransfer'
import { dirtyDocumentPaths, pendingDocumentSaves, snapshotWindowDrafts } from '../services/windowDrafts'
import WorkSessionTransferDialog from './WorkSessionTransferDialog.vue'
const store = useAppStore(), router = useRouter(), dialog = useDialog(), message = useMessage()
const menuOpen = ref(false), menuX = ref(0), menuY = ref(0)
let contextGeneration = 0, disposed = false
const busy = ref(false)
const transfer = ref<{mode:'import'|'export'|'restore';bundle:PortableWorkSession;root:string;expected?:WorkSession} | null>(null)
const menuOptions = computed(() => [{ label:'导入工作现场…',key:'import' }, { label:'导出所选现场…',key:'export',disabled:!selected.value }, { type:'divider' as const,key:'divider' }, { label:'重命名',key:'rename',disabled:!selected.value }, { label:'删除命名记录',key:'delete',disabled:!selected.value }])
const assertContext = (root: string, generation: number) => { if (disposed || root !== store.libraryPath || generation !== contextGeneration) throw Error('资料库已切换，操作已取消') }
const assertNoSave = () => { if (pendingDocumentSaves.value || store.tabs.some(tab => hasPendingMainTextSave(tab.path))) throw Error('文件正在保存，请等待完成后继续') }
const showMenu = (event: MouseEvent | KeyboardEvent) => {
  if (busy.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuX.value = rect.left; menuY.value = rect.bottom; menuOpen.value = true
}
const sessions = ref<WorkSession[]>([]), selected = ref(''), naming = ref(false), name = ref(''), notice = ref(''), failed = ref(false)
const report = (error: unknown) => { failed.value = true; notice.value = `工作现场操作失败：${String(error)}` }
watch(() => store.libraryPath, root => {
  ++contextGeneration; menuOpen.value = false; transfer.value = null
  selected.value = ''; sessions.value = []; failed.value = false; notice.value = ''; naming.value = false
  if (!root) return
  try { sessions.value = readWorkSessions(localStorage, root) } catch (error) { report(error) }
}, { immediate: true })
const manageSession = async (key: string) => {
  menuOpen.value = false
  const root = store.libraryPath, generation = contextGeneration
  try {
    if (key === 'import') {
      busy.value = true
      const sourcePath = await open({ title:'选择工作现场文件', multiple:false, directory:false, filters:[{name:'工作现场',extensions:['longedit-session.json']}] }); assertContext(root,generation)
      if (typeof sourcePath !== 'string') return
      const bundle = validatePortableWorkSession(await invoke('read_work_session_bundle',{sourcePath})); assertContext(root,generation)
      transfer.value = {mode:'import',bundle,root}; return
    }
    const entry = readWorkSessions(localStorage, root).find(item => item.id === selected.value)
    if (!entry) throw new Error('工作现场记录已变化')
    if (key === 'export') {
      if(entry.tabs.length>128)throw Error('迁移文件最多包含 128 份文件；旧现场仍可完整接续。请将需要迁移的文件另存为较小的现场。')
      transfer.value = {mode:'export',bundle:exportableWorkSession(entry),root}; return
    }
    let newName: string | null
    if (key === 'rename') {
      newName = await promptAppAction(dialog, { title: '重命名工作现场', initialValue: entry.name })
      if (newName === null) return
    } else {
      if (!await confirmAppAction(dialog, { title: '删除命名记录', content: `仅删除“${entry.name}”的现场记录，不删除文件或当前文稿。`, positiveText: '删除记录', danger: true })) return
      newName = null
    }
    if (generation !== contextGeneration || root !== store.libraryPath) throw new Error('资料库已切换，操作已取消')
    sessions.value = editWorkSession(localStorage, root, entry, newName)
    if (newName === null) selected.value = ''
    failed.value = false; notice.value = newName === null ? '已删除命名记录，文件保持不变。' : '已重命名工作现场。'
  } catch (error) { if (!disposed) report(error) }
  finally { busy.value = false }
}
const saveSession = () => {
  try {
    snapshotWindowDrafts()
    const session = captureWorkSession(store.libraryPath, store.tabs, store.activeTabId, name.value)
    session.search = snapshotSearchSession(store.libraryPath)
    session.views = captureWorkspaceViewStates(session.tabs.map(tab => tab.path))
    session.reference = readWorkspaceReference(store.libraryPath)
    sessions.value = saveWorkSession(localStorage, session)
    selected.value = session.id; naming.value = false; failed.value = false
    notice.value = `已记住“${session.name}”的文件；正文未写入磁盘。`
  } catch (error) { report(error) }
}
const openSession = async () => {
  if (busy.value) return
  const root = store.libraryPath, generation = contextGeneration
  busy.value = true
  try {
    assertNoSave()
    if (selected.value) {
      const session = readWorkSessions(localStorage, root).find(item => item.id === selected.value)
      if (!session) throw new Error('工作现场记录已变化，请重新进入工作台')
      // Legacy empty scenes can still restore their search, without clearing
      // the user's current documents. Portable exports require actual files.
      if (!session.tabs.length) {
        const paths=localSessionPaths(session)
        const frame=paths.length?await invoke<SessionPreflight>('preflight_work_session',{libraryRoot:root,relativePaths:paths}):{libraryRoot:root,files:[]}
        assertContext(root,generation);assertNoSave()
        const found=readWorkSessions(localStorage,root).find(item=>item.id===session.id)
        if(!found||JSON.stringify(found)!==JSON.stringify(session))throw Error('工作现场已变化，请重新选择')
        const result=availableWorkSession(session,frame),oldReference=readWorkspaceReference(root),oldSearch=snapshotSearchSession(root)
        try{writeWorkspaceReference(root,result.session.reference);restoreSearchSession(root,session.search)}
        catch(cause){
          let incomplete=false
          for(const undo of [()=>writeWorkspaceReference(root,oldReference),()=>restoreSearchSession(root,oldSearch)])try{undo()}catch{incomplete=true}
          throw Error(`空现场设置恢复未完成：${String(cause)}${incomplete?'；请核对阅读/参考设置。':''}`)
        }
        if(result.missing.length)message.warning('参考资料暂不可用，仍保留在原命名记录中；当前文稿未替换。')
      }
      else {
        const paths = localSessionPaths(session), frame: SessionPreflight = {libraryRoot:root,files:[]}
        for(let offset=0;offset<paths.length;offset+=128) {
          const part=await invoke<SessionPreflight>('preflight_work_session',{libraryRoot:root,relativePaths:paths.slice(offset,offset+128)}); assertContext(root,generation)
          if(!sameWorkspacePath(part.libraryRoot,root))throw Error('预检资料库身份不一致')
          frame.files.push(...part.files)
        }
        if(session.tabs.length>128){
          const result=availableWorkSession(session,frame)
          await commitReadySession(session,result.session,true)
          if(result.missing.length)message.warning(`已恢复可用文件；${result.missing.length} 份失效资料仍保留在原现场记录中。迁移/逐项重定位界面每次支持 128 份文件。`)
          return
        }
        const bundle = exportableWorkSession(session)
        if (frame.files.some(file=>file.state !== 'ready')) { transfer.value = {mode:'restore',bundle,root,expected:session}; return }
        await restoreFromBundle(bundle,frame,session,true); return
      }
    }
    assertContext(root,generation)
    await router.push({ name: 'LibraryMode', query: store.activeTabId ? { path: store.activeTabId } : {} })
  } catch (error) { if (!disposed) report(error) }
  finally { busy.value = false }
}
async function restoreFromBundle(bundle: PortableWorkSession, frame: SessionPreflight, expected: WorkSession, includeContext: boolean) {
  const root = store.libraryPath
  if (!sameWorkspacePath(root,expected.libraryRoot)) throw Error('资料库已变化，请重新核对')
  const found = readWorkSessions(localStorage,root).find(item=>item.id===expected.id)
  if (!found || JSON.stringify(found)!==JSON.stringify(expected)) throw Error('工作现场已变化，请关闭弹窗重新选择')
  const changed = JSON.stringify(exportableWorkSession(expected)) !== JSON.stringify(bundle)
  const replacement = materializeWorkSession(bundle,root,expected.id,expected.name,expected.importFingerprint)
  if (!changed) replacement.search = expected.search
  const ready = availableWorkSession(replacement,frame).session
  await commitReadySession(expected,ready,includeContext,changed?replacement:undefined)
}
async function commitReadySession(expected: WorkSession, ready: WorkSession, includeContext: boolean, replacement?: WorkSession) {
  const root=store.libraryPath
  const found=readWorkSessions(localStorage,root).find(item=>item.id===expected.id)
  if(!sameWorkspacePath(root,expected.libraryRoot)||!found||JSON.stringify(found)!==JSON.stringify(expected))throw Error('工作现场或资料库已变化，请重新选择')
  assertNoSave(); snapshotWindowDrafts()
  if (!ready.tabs.length) throw Error('当前没有可恢复的文件，请先重新定位；原现场记录仍保留')
  const plan = planWorkSessionRestore(store.tabs,store.activeTabId,ready,dirtyDocumentPaths())
  const oldReference = readWorkspaceReference(root), oldSearch = snapshotSearchSession(root)
  const tabKey = libraryTabsKey(root), oldTabs = localStorage.getItem(tabKey)
  const undoViews = stageWorkspaceViewStates(ready.views || {},plan.cleanPaths.filter(path=>ready.views?.[path]))
  try {
    if (includeContext) { writeWorkspaceReference(root,ready.reference); restoreSearchSession(root,ready.search) }
    const persistentTabs = plan.tabs.filter(tab=>!('external' in tab && tab.external)).map(tab=>({id:tab.id,path:tab.path,title:tab.title,isDirty:false,...(tab.pinned?{pinned:true}:{})}))
    localStorage.setItem(tabKey,JSON.stringify({tabs:persistentTabs,activeTabId:persistentTabs.some(tab=>tab.id===plan.activeTabId)?plan.activeTabId:persistentTabs[0]?.id || null,recentFiles:store.recentFiles,starredFiles:store.starredFiles}))
    if (replacement) repairWorkSessionRecord(localStorage,root,expected,replacement)
  } catch (cause) {
    let rollbackFailed = false
    for (const undo of [undoViews,()=>writeWorkspaceReference(root,oldReference),()=>restoreSearchSession(root,oldSearch),()=>{if(localStorage.getItem(tabKey)!==oldTabs){if(oldTabs===null)localStorage.removeItem(tabKey);else localStorage.setItem(tabKey,oldTabs)}}]) try { undo() } catch { rollbackFailed = true }
    throw Error(`接续未完成，当前文稿仍保留：${String(cause)}${rollbackFailed?'；部分阅读/参考设置未能还原，请核对。':''}`)
  }
  store.tabs = plan.tabs as TabInfo[]; store.activeTabId = plan.activeTabId
  failed.value = false; notice.value = '已恢复可用文件，当前未保存文稿保留。'
  await router.push({name:'LibraryMode',query:store.activeTabId?{path:store.activeTabId}:{}})
}
function imported(entry: WorkSession, duplicate: boolean) {
  sessions.value = readWorkSessions(localStorage,store.libraryPath)
  if (sameWorkspacePath(entry.libraryRoot,store.libraryPath)) selected.value = entry.id
  const library = store.libraries.find(item=>sameWorkspacePath(item.path,entry.libraryRoot))
  notice.value = duplicate ? `“${entry.name}”已存在，未重复添加。` : `已将“${entry.name}”保存到${library?.name || '所选资料库'}；当前文稿不变。`
  failed.value = false
}
onBeforeUnmount(()=>{disposed=true;++contextGeneration})
</script>
<style scoped>
.work-session-bar { padding: var(--workflow-panel-padding, 16px); margin-bottom: 18px; border: var(--theme-border); border-radius: var(--theme-radius); background: var(--style-card-gradient, var(--theme-surface)); box-shadow: var(--workflow-panel-shadow, none); color: var(--theme-text); }
.session-heading { display: grid; gap: 4px; margin-bottom: 12px; }
.session-heading strong { font-size: var(--text-md); }
.session-heading small { color: var(--theme-text-secondary); font-size: var(--text-sm); }
.session-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.session-controls select, .session-controls input { font: inherit; color: var(--theme-text); background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); padding: 6px 8px; min-width: 130px; max-width: 100%; flex: 1; }
.session-controls select:focus-visible, .session-controls input:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
.work-session-bar p { margin: 0; font-size: var(--text-compact); color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.work-session-bar p.error { color: var(--status-danger); }
</style>
