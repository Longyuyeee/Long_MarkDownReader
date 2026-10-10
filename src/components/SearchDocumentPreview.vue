<template>
  <aside ref="panel" class="search-document-preview" role="region" aria-label="搜索内容预览" tabindex="-1" @keydown.esc.stop.prevent="$emit('close')">
    <header>
      <div><strong>{{ result.title }}</strong><small :title="result.path">{{ relativePath }}</small></div>
      <button type="button" aria-label="关闭预览" @click="$emit('close')">×</button>
    </header>
    <div class="preview-state" aria-live="polite">
      <span v-if="loading">正在读取内容…</span>
      <template v-else-if="error"><p>{{ error }}</p><button type="button" @click="load">重试</button></template>
      <template v-else-if="preview"><span>{{ preview.label }} · 只读</span><p v-if="!preview.matchFound">这段内容中没有找到当前关键词，展示开头内容。</p><p v-if="preview.truncated">已展示部分内容，打开文件可查看完整内容。</p></template>
    </div>
    <div v-if="preview && !loading && !error" class="preview-text"><SearchHighlight :text="preview.text || '此处暂无可预览的文字。'" :query="query" /></div>
    <footer><small>预览磁盘上的内容，不改动当前草稿。</small><button type="button" class="preview-open" @click="$emit('open')">打开文件</button></footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import SearchHighlight from './SearchHighlight.vue'
import { searchResultPath } from '../utils/searchResultPath'
const props = defineProps<{ libraryRoot: string; query: string; result: { path: string; title: string; page?: number; annotationId?: string; matchKind: string } }>()
defineEmits<{ close: []; open: [] }>()
interface Preview { text: string; label: string; truncated: boolean; matchFound: boolean }
const panel = ref<HTMLElement | null>(null)
const preview = ref<Preview | null>(null)
const loading = ref(false)
const error = ref('')
const relativePath = computed(() => searchResultPath(props.result.path, props.libraryRoot))
let generation = 0
let returnFocus: HTMLElement | null = null
async function load() {
  const current = ++generation
  loading.value = true; error.value = ''; preview.value = null
  try {
    const response = await invoke<Preview>('preview_search_document', {
      libraryRoot: props.libraryRoot, path: props.result.path, query: props.query,
      page: props.result.page ?? null, annotationId: props.result.annotationId ?? null,
      matchKind: props.result.matchKind,
    })
    if (current === generation) {
      preview.value = response
      await nextTick()
      if (current === generation) panel.value?.querySelector('.preview-text')?.scrollTo(0, 0)
    }
  } catch (reason) {
    if (current === generation) error.value = `暂时无法预览：${String(reason)}`
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(() => [props.result, props.libraryRoot, props.query], load, { immediate: true })
onMounted(async () => { returnFocus = document.activeElement as HTMLElement | null; await nextTick(); panel.value?.focus() })
onBeforeUnmount(() => { ++generation; if (returnFocus?.isConnected && (document.activeElement === document.body || panel.value?.contains(document.activeElement))) returnFocus.focus() })
</script>

<style scoped>
.search-document-preview { position: fixed; z-index: 100; top: 76px; right: 18px; width: min(540px, calc(100vw - 36px)); max-height: calc(100vh - 100px); display: flex; flex-direction: column; color: var(--theme-text); background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius, 12px); box-shadow: 0 12px 36px #0003; overflow: hidden; }
header, footer { display: flex; align-items: center; gap: 12px; padding: 12px 16px; flex-shrink: 0; }
header { border-bottom: var(--theme-border); }
header div { flex: 1; min-width: 0; }
header strong, header small { display: block; overflow-wrap: anywhere; }
small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
button { font: inherit; color: var(--theme-primary); background: transparent; border: var(--theme-border); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
.preview-state { padding: 10px 16px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.preview-state p { margin: 4px 0; }
.preview-text { min-height: 60px; overflow: auto; padding: 8px 16px 20px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; line-height: 1.7; }
footer { justify-content: space-between; border-top: var(--theme-border); }
.preview-open { flex-shrink: 0; }
</style>
