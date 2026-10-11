<template>
  <section class="work-session-bar" aria-label="工作现场">
    <div class="session-controls">
      <label for="work-session-choice">工作现场</label>
      <select id="work-session-choice" v-model="selected"><option value="">上次工作 · 自动记住</option><option v-for="item in sessions" :key="item.id" :value="item.id">{{ item.name }}</option></select>
      <n-button size="small" type="primary" @click="openSession">继续工作</n-button>
      <n-button size="small" @click="naming = true">命名保存…</n-button>
    </div>
    <form v-if="naming" class="session-controls" @submit.prevent="saveSession">
      <label for="work-session-name">名称</label><input id="work-session-name" v-model="name" maxlength="60" autofocus />
      <n-button size="small" attr-type="submit">保存现场</n-button><n-button size="small" @click="naming = false">取消</n-button>
    </form>
    <p role="status" :class="{ error: failed }">{{ notice || '自动记住打开的文件；命名保存不写入正文。' }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore, type TabInfo } from '../store/app'
import { sameWorkspacePath } from '../utils/savedCollections'
import { hasPendingMainTextSave } from '../utils/mainTextSaveOwnership'
import { snapshotSearchSession, restoreSearchSession } from '../composables/useSearchReturn'
import { captureWorkspaceViewStates, restoreWorkspaceViewStates } from '../services/workspaceViewState'
import { captureWorkSession, readWorkSessions, saveWorkSession, mergeSessionTabs, type WorkSession } from '../utils/workSessions'
const store = useAppStore(), router = useRouter()
const sessions = ref<WorkSession[]>([]), selected = ref(''), naming = ref(false), name = ref(''), notice = ref(''), failed = ref(false)
const report = (error: unknown) => { failed.value = true; notice.value = `工作现场操作失败：${String(error)}` }
watch(() => store.libraryPath, root => {
  selected.value = ''; sessions.value = []; failed.value = false; notice.value = ''; naming.value = false
  if (!root) return
  try { sessions.value = readWorkSessions(localStorage, root) } catch (error) { report(error) }
}, { immediate: true })
const saveSession = () => {
  try {
    const session = captureWorkSession(store.libraryPath, store.tabs, store.activeTabId, name.value)
    session.search = snapshotSearchSession(store.libraryPath)
    session.views = captureWorkspaceViewStates(session.tabs.map(tab => tab.path))
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
.work-session-bar { padding: 12px 0; color: var(--theme-text); }
.session-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.session-controls select, .session-controls input { font: inherit; color: var(--theme-text); background: var(--theme-surface); border: var(--theme-border); border-radius: 5px; padding: 5px 8px; min-width: 130px; max-width: 100%; flex: 1; }
.work-session-bar p { margin: 0; font-size: var(--text-compact); color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.work-session-bar p.error { color: var(--status-danger); }
</style>
