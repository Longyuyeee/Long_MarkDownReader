<template>
  <section class="work-session-bar" aria-label="工作现场">
    <div class="session-heading"><strong>接着上次的工作</strong><small>自动记住文件、阅读位置和参考资料</small></div>
    <div class="session-controls">
      <label for="work-session-choice">工作现场</label>
      <select id="work-session-choice" v-model="selected" title="右键或 Shift+F10 重命名、删除命名记录" @contextmenu.prevent="showMenu" @keydown.shift.f10.prevent="showMenu"><option value="">上次工作 · 自动记住</option><option v-for="item in sessions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
      <n-button size="small" type="primary" @click="openSession">继续工作</n-button>
      <n-button size="small" @click="naming = true">命名保存…</n-button>
      <n-button size="small" :disabled="!selected" :aria-expanded="menuOpen" aria-haspopup="menu" @click="showMenu">管理现场</n-button>
    </div>
    <form v-if="naming" class="session-controls" @submit.prevent="saveSession">
      <label for="work-session-name">名称</label><input id="work-session-name" v-model="name" maxlength="60" autofocus />
      <n-button size="small" attr-type="submit">保存现场</n-button><n-button size="small" @click="naming = false">取消</n-button>
    </form>
    <p role="status" :class="{ error: failed }">{{ notice || '自动记住打开的文件；命名保存不写入正文。' }}</p>
    <n-dropdown trigger="manual" :show="menuOpen" :x="menuX" :y="menuY" :options="[{ label: '重命名', key: 'rename' }, { label: '删除命名记录', key: 'delete' }]" @clickoutside="menuOpen = false" @select="manageSession" />
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDialog } from 'naive-ui'
import { confirmAppAction, promptAppAction } from '../services/appDialog'
import { useAppStore, type TabInfo } from '../store/app'
import { sameWorkspacePath } from '../utils/savedCollections'
import { hasPendingMainTextSave } from '../utils/mainTextSaveOwnership'
import { snapshotSearchSession, restoreSearchSession } from '../composables/useSearchReturn'
import { captureWorkspaceViewStates, restoreWorkspaceViewStates } from '../services/workspaceViewState'
import { readWorkspaceReference, writeWorkspaceReference } from '../services/workspaceReference'
import { captureWorkSession, readWorkSessions, saveWorkSession, editWorkSession, mergeSessionTabs, type WorkSession } from '../utils/workSessions'
const store = useAppStore(), router = useRouter(), dialog = useDialog()
const menuOpen = ref(false), menuX = ref(0), menuY = ref(0)
let contextGeneration = 0
const showMenu = (event: MouseEvent | KeyboardEvent) => {
  if (!selected.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuX.value = rect.left; menuY.value = rect.bottom; menuOpen.value = true
}
const sessions = ref<WorkSession[]>([]), selected = ref(''), naming = ref(false), name = ref(''), notice = ref(''), failed = ref(false)
const report = (error: unknown) => { failed.value = true; notice.value = `工作现场操作失败：${String(error)}` }
watch(() => store.libraryPath, root => {
  ++contextGeneration; menuOpen.value = false
  selected.value = ''; sessions.value = []; failed.value = false; notice.value = ''; naming.value = false
  if (!root) return
  try { sessions.value = readWorkSessions(localStorage, root) } catch (error) { report(error) }
}, { immediate: true })
const manageSession = async (key: string) => {
  menuOpen.value = false
  const root = store.libraryPath, generation = contextGeneration
  try {
    const entry = readWorkSessions(localStorage, root).find(item => item.id === selected.value)
    if (!entry) throw new Error('工作现场记录已变化')
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
  } catch (error) { report(error) }
}
const saveSession = () => {
  try {
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
  try {
    if (selected.value) {
      if (store.tabs.some(tab => hasPendingMainTextSave(tab.path))) throw new Error('文件正在保存，请等待完成后继续')
      const session = readWorkSessions(localStorage, store.libraryPath).find(item => item.id === selected.value)
      if (!session) throw new Error('工作现场记录已变化，请重新进入工作台')
      writeWorkspaceReference(store.libraryPath, session.reference)
      const cleanPaths = session.tabs.filter(saved => !store.tabs.some(tab => tab.isDirty && sameWorkspacePath(tab.path, saved.path))).map(tab => tab.path)
      if (session.views) restoreWorkspaceViewStates(session.views, cleanPaths)
      restoreSearchSession(store.libraryPath, session.search)
      store.tabs = mergeSessionTabs(store.tabs, session.tabs) as TabInfo[]
      store.activeTabId = store.tabs.find(tab => session.activeTabId && sameWorkspacePath(tab.path, session.activeTabId))?.id || store.tabs[0]?.id || null
      store.saveTabsState()
    }
    await router.push({ name: 'LibraryMode', query: store.activeTabId ? { path: store.activeTabId } : {} })
  } catch (error) { report(error) }
}
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
