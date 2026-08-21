<template>
  <div class="workspace-tabs" :class="{ 'can-scroll-left': canScrollLeft, 'can-scroll-right': canScrollRight }">
    <n-tooltip placement="bottom-start" :delay="tooltipDelay" :duration="tooltipDuration" :show-arrow="false" :content-style="compactTooltipStyle">
      <template #trigger>
        <button
          type="button"
          class="tab-scroll-button scroll-left"
          aria-label="向左浏览标签"
          :disabled="!canScrollLeft"
          @click="scrollTabs(-1)"
        >
          <ChevronLeftIcon :size="16" />
        </button>
      </template>
      向左浏览标签
    </n-tooltip>
    <div ref="scrollRef" class="workspace-tabs-scroll" role="tablist" aria-label="打开的文档" @scroll="updateScrollState" @wheel="handleWheel">
      <n-tooltip
        v-for="tab in store.tabs"
        :key="tab.id"
        placement="bottom-start"
        :delay="tooltipDelay"
        :duration="tooltipDuration"
        :show-arrow="false"
        :content-style="documentTooltipStyle"
      >
        <template #trigger>
          <div
            class="workspace-tab"
            :class="{ active: store.activeTabId === tab.id }"
            role="tab"
            :tabindex="store.activeTabId === tab.id ? 0 : -1"
            :aria-selected="store.activeTabId === tab.id"
            :aria-label="`${tab.title}${tab.isDirty ? '，有未保存的修改' : ''}`"
            @click="activate(tab)"
            @keydown.enter.prevent="activate(tab)"
            @keydown.space.prevent="activate(tab)"
            @keydown.left.prevent="focusAdjacentTab(tab, -1)"
            @keydown.right.prevent="focusAdjacentTab(tab, 1)"
          >
            <FileTextIcon :size="13" />
            <span>{{ tab.title }}</span>
            <i :class="{ visible: tab.isDirty }" aria-hidden="true"></i>
            <button type="button" class="close-tab" :aria-label="`关闭标签：${tab.title}`" @click.stop="close(tab)" @keydown.stop>
              <XIcon :size="12" />
            </button>
          </div>
        </template>
        <div class="workspace-tab-tooltip">
          <strong>{{ tab.title }}</strong>
          <span>{{ tab.path }}</span>
          <small v-if="tab.isDirty">有未保存的修改</small>
        </div>
      </n-tooltip>
    </div>
    <n-tooltip placement="bottom-end" :delay="tooltipDelay" :duration="tooltipDuration" :show-arrow="false" :content-style="compactTooltipStyle">
      <template #trigger>
        <button
          type="button"
          class="tab-scroll-button scroll-right"
          aria-label="向右浏览标签"
          :disabled="!canScrollRight"
          @click="scrollTabs(1)"
        >
          <ChevronRightIcon :size="16" />
        </button>
      </template>
      向右浏览标签
    </n-tooltip>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { NTooltip, useDialog } from 'naive-ui'
import { useRouter } from 'vue-router'
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, FileText as FileTextIcon, X as XIcon } from 'lucide-vue-next'
import { findFileFormat, opensInLibraryShell, routeForFile } from '../config/fileFormats'
import { openManagedFile } from '../services/fileNavigation'
import { confirmAppAction } from '../services/appDialog'
import { type TabInfo, useAppStore } from '../store/app'

const router = useRouter()
const store = useAppStore()
const dialog = useDialog()
const scrollRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let resizeObserver: ResizeObserver | null = null
const tooltipDelay = 420
const tooltipDuration = 120
const tooltipBaseStyle: CSSProperties = {
  border: 'var(--theme-border)',
  borderRadius: 'var(--theme-radius-sm)',
  background: 'var(--theme-surface)',
  color: 'var(--theme-text)',
  boxShadow: 'var(--workspace-shadow)',
  fontSize: '12px',
  lineHeight: '1.45',
}
const compactTooltipStyle: CSSProperties = {
  ...tooltipBaseStyle,
  padding: '7px 9px',
}
const documentTooltipStyle: CSSProperties = {
  ...tooltipBaseStyle,
  maxWidth: 'min(420px, calc(100vw - 24px))',
  padding: '9px 11px',
}

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
  element.scrollBy({ left: delta, behavior: 'auto' })
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
  if (tab.isDirty && !await confirmAppAction(dialog, {
    title: '关闭未保存的标签？',
    content: `“${tab.title}”包含未保存修改，关闭后将无法恢复。`,
    positiveText: '放弃修改并关闭',
    danger: true,
  })) return
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

.workspace-tab-tooltip {
  display: grid;
  gap: 3px;
  min-width: 150px;
}

.workspace-tab-tooltip strong,
.workspace-tab-tooltip span {
  overflow-wrap: anywhere;
}

.workspace-tab-tooltip strong {
  font-size: 12px;
  font-weight: 650;
}

.workspace-tab-tooltip span,
.workspace-tab-tooltip small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.workspace-tab-tooltip small {
  color: var(--theme-primary);
}
</style>
