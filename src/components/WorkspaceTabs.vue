<template>
  <div class="workspace-tabs" role="tablist" aria-label="打开的文档">
    <div class="workspace-tabs-scroll">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="workspace-tab"
        :class="{ active: store.activeTabId === tab.id }"
        role="tab"
        tabindex="0"
        :aria-selected="store.activeTabId === tab.id"
        :title="tab.path"
        @click="activate(tab)"
        @keydown.enter.prevent="activate(tab)"
        @keydown.space.prevent="activate(tab)"
      >
        <FileTextIcon :size="13" />
        <span>{{ tab.title }}</span>
        <i :class="{ visible: tab.isDirty }" :title="tab.isDirty ? '有未保存的修改' : undefined"></i>
        <button type="button" class="close-tab" title="关闭标签" @click.stop="close(tab)" @keydown.stop>
          <XIcon :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { FileText as FileTextIcon, X as XIcon } from 'lucide-vue-next'
import { routeForFile } from '../config/fileFormats'
import { type TabInfo, useAppStore } from '../store/app'

const router = useRouter()
const store = useAppStore()

const routeToTab = async (tab: TabInfo) => {
  const target = routeForFile(tab.path)
  if (!target) return
  if (target.name === 'LibraryMode') {
    await router.push({ name: 'LibraryMode' })
  } else {
    await router.push({
      ...target,
      query: {
        ...(target.query || {}),
        ...(tab.external ? { external: '1' } : {}),
      },
    })
  }
}

const activate = async (tab: TabInfo) => {
  store.activateTab(tab.id)
  await routeToTab(tab)
}

const close = async (tab: TabInfo) => {
  if (tab.isDirty && !window.confirm(`“${tab.title}”有未保存修改，关闭后将丢失，是否继续？`)) return
  const wasActive = store.activeTabId === tab.id
  store.removeTab(tab.id)
  if (!wasActive) return
  const next = store.tabs.find(item => item.id === store.activeTabId)
  if (next) await routeToTab(next)
  else await router.push({ name: 'LibraryMode' })
}
</script>

<style scoped>
.workspace-tabs {
  flex: 1 1 auto;
  min-width: 0;
  height: 34px;
  border-bottom: var(--theme-border);
  background: var(--theme-surface);
}

.workspace-tabs-scroll {
  height: 100%;
  display: flex;
  align-items: end;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 0 8px;
}

.workspace-tab {
  position: relative;
  flex: 0 1 190px;
  min-width: 92px;
  max-width: 210px;
  height: 30px;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 8px 20px;
  align-items: center;
  gap: 5px;
  padding: 0 3px 0 9px;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.workspace-tab:hover {
  color: var(--theme-text);
  background: var(--theme-surface-2);
}

.workspace-tab.active {
  color: var(--theme-text);
  border-bottom-color: var(--theme-primary);
  background: var(--theme-bg);
}

.workspace-tab:focus-visible,
.close-tab:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: -2px;
}

.workspace-tab > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.workspace-tab > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme-primary);
  visibility: hidden;
}

.workspace-tab > i.visible {
  visibility: visible;
}

.close-tab {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.close-tab:hover {
  color: var(--theme-text);
  background: rgba(var(--theme-primary-rgb), 0.1);
}
</style>
