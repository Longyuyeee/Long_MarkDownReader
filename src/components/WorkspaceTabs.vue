<template>
  <div class="workspace-tabs" :class="{ 'can-scroll-left': canScrollLeft, 'can-scroll-right': canScrollRight }">
    <button
      type="button"
      class="tab-scroll-button scroll-left"
      title="向左浏览标签"
      aria-label="向左浏览标签"
      :disabled="!canScrollLeft"
      @click="scrollTabs(-1)"
    >
      <ChevronLeftIcon :size="16" />
    </button>
    <div ref="scrollRef" class="workspace-tabs-scroll" role="tablist" aria-label="打开的文档" @scroll="updateScrollState" @wheel="handleWheel">
      <div
        v-for="tab in store.tabs"
        :key="tab.id"
        class="workspace-tab"
        :class="{ active: store.activeTabId === tab.id }"
        role="tab"
        :tabindex="store.activeTabId === tab.id ? 0 : -1"
        :aria-selected="store.activeTabId === tab.id"
        :title="tab.path"
        @click="activate(tab)"
        @keydown.enter.prevent="activate(tab)"
        @keydown.space.prevent="activate(tab)"
        @keydown.left.prevent="focusAdjacentTab(tab, -1)"
        @keydown.right.prevent="focusAdjacentTab(tab, 1)"
      >
        <FileTextIcon :size="13" />
        <span>{{ tab.title }}</span>
        <i :class="{ visible: tab.isDirty }" :title="tab.isDirty ? '有未保存的修改' : undefined"></i>
        <button type="button" class="close-tab" title="关闭标签" @click.stop="close(tab)" @keydown.stop>
          <XIcon :size="12" />
        </button>
      </div>
    </div>
    <button
      type="button"
      class="tab-scroll-button scroll-right"
      title="向右浏览标签"
      aria-label="向右浏览标签"
      :disabled="!canScrollRight"
      @click="scrollTabs(1)"
    >
      <ChevronRightIcon :size="16" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, FileText as FileTextIcon, X as XIcon } from 'lucide-vue-next'
import { findFileFormat, opensInLibraryShell, routeForFile } from '../config/fileFormats'
import { openManagedFile } from '../services/fileNavigation'
import { type TabInfo, useAppStore } from '../store/app'

const router = useRouter()
const store = useAppStore()
const scrollRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let resizeObserver: ResizeObserver | null = null

const updateScrollState = () => {
  const element = scrollRef.value
  if (!element) return
  canScrollLeft.value = element.scrollLeft > 2
  canScrollRight.value = element.scrollLeft + element.clientWidth < element.scrollWidth - 2
}

const scrollTabs = (direction: -1 | 1) => {
  const element = scrollRef.value
  if (!element) return
  element.scrollBy({ left: direction * Math.max(240, element.clientWidth * 0.65), behavior: 'smooth' })
}

const handleWheel = (event: WheelEvent) => {
  const element = scrollRef.value
  if (!element || element.scrollWidth <= element.clientWidth + 2) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (!delta) return
  event.preventDefault()
  element.scrollBy({ left: delta, behavior: 'smooth' })
}

const routeToTab = async (tab: TabInfo) => {
  const target = routeForFile(tab.path)
  if (!target) return
  if (!tab.external && opensInLibraryShell(findFileFormat(tab.path))) {
    await openManagedFile(router, tab.path)
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
  await routeToTab(tab)
  store.activateTab(tab.id)
}

const revealActiveTab = async () => {
  await nextTick()
  const active = scrollRef.value?.querySelector<HTMLElement>('.workspace-tab.active')
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  window.setTimeout(updateScrollState, 220)
}

const focusAdjacentTab = async (tab: TabInfo, direction: -1 | 1) => {
  const index = store.tabs.findIndex(item => item.id === tab.id)
  if (index < 0) return
  const next = store.tabs[(index + direction + store.tabs.length) % store.tabs.length]
  if (!next) return
  await activate(next)
  await revealActiveTab()
  scrollRef.value?.querySelector<HTMLElement>('.workspace-tab.active')?.focus()
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


watch([() => store.activeTabId, () => store.tabs.length], revealActiveTab)

onMounted(() => {
  resizeObserver = new ResizeObserver(updateScrollState)
  if (scrollRef.value) resizeObserver.observe(scrollRef.value)
  updateScrollState()
  void revealActiveTab()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.workspace-tabs {
  position: relative;
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
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  scroll-behavior: smooth;
  padding: 0 34px;
}

.workspace-tabs-scroll::-webkit-scrollbar {
  display: none;
}

.workspace-tab {
  position: relative;
  flex: 0 0 176px;
  min-width: 156px;
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

.tab-scroll-button {
  position: absolute;
  z-index: 3;
  top: 3px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  cursor: pointer;
  opacity: 1;
}

.tab-scroll-button:hover:not(:disabled) {
  color: var(--theme-primary);
  background: var(--theme-surface-2);
}

.tab-scroll-button:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: -2px;
}

.tab-scroll-button:disabled {
  pointer-events: none;
  opacity: 0;
}

.scroll-left {
  left: 0;
  border-right: var(--theme-border);
  box-shadow: 8px 0 14px rgba(15, 23, 42, 0.08);
}

.scroll-right {
  right: 0;
  border-left: var(--theme-border);
  box-shadow: -8px 0 14px rgba(15, 23, 42, 0.08);
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
