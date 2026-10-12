<template>
  <div class="inbox-view">
    <WorkspaceManagementHeader title="收集箱" :subtitle="store.currentLibraryName" @back="router.push({ name: 'LibraryMode' })">
      <n-button size="small" :disabled="!store.libraryPath" @click="quickNote"><template #icon><SquarePen :size="16" /></template>快速笔记</n-button>
    </WorkspaceManagementHeader>
    <WorkspaceManagementContent v-if="store.libraryPath" narrow>
      <div class="workflow-page-heading"><h1>临时资料，随时回看</h1><p>浏览收集目录中的文件；记笔记时也可以直接选择其他保存位置。</p></div>
      <InboxBrowser :library-root="store.libraryPath" standalone @close="router.push({ name: 'LibraryMode' })" @open="openFile" />
      <p v-if="actionError" role="alert" class="workflow-action-error">{{ actionError }}</p>
    </WorkspaceManagementContent>
    <WorkspaceEmptyState v-else as="main"><h1>先选择一个资料库</h1><p>收集箱使用当前资料库中的目录。</p><n-button @click="router.push({ name: 'Settings', query: { category: 'library' } })">管理资料库</n-button></WorkspaceEmptyState>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { SquarePen } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import { openManagedFile } from '../services/fileNavigation'
import InboxBrowser from '../components/InboxBrowser.vue'
import WorkspaceManagementHeader from '../components/workspace/WorkspaceManagementHeader.vue'
import WorkspaceManagementContent from '../components/workspace/WorkspaceManagementContent.vue'
import WorkspaceEmptyState from '../components/workspace/WorkspaceEmptyState.vue'
const store = useAppStore(), router = useRouter(), actionError = ref('')
const openFile = async (path: string) => {
  actionError.value = ''
  try { await openManagedFile(router, path) } catch (error) { actionError.value = `暂时无法打开文件：${String(error)}` }
}
const quickNote = async () => {
  actionError.value = ''
  try { await invoke('open_quick_note') } catch (error) { actionError.value = `暂时无法打开快速笔记：${String(error)}` }
}
</script>

<style scoped>
.inbox-view { height: 100%; display: flex; flex-direction: column; overflow-y: auto; background: var(--theme-bg); color: var(--theme-text); }
.inbox-view :deep(.inbox-browser) { overflow: visible; }
</style>
