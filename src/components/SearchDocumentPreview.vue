<template>
  <aside ref="panel" class="search-document-preview pinned" role="region" aria-label="参考资料（只读）" tabindex="-1" @keydown.esc.stop.prevent="$emit('close')">
    <header>
      <div><small>参考 · 只读</small><strong>{{ result.title }}</strong><small :title="result.path">{{ relativePath }}</small></div>
      <button type="button" class="reference-return" @click="$emit('returnToEditor')">返回编辑</button>
      <button type="button" aria-label="关闭参考" @click="$emit('close')">×</button>
    </header>
    <div class="preview-state" aria-live="polite">
      <span v-if="loading">正在读取内容…</span>
      <template v-else-if="error"><p>{{ error }}</p><button type="button" @click="load">重试</button></template>
      <template v-else-if="preview"><span>{{ preview.label }} · 只读</span><p v-if="!preview.matchFound">这段内容中没有找到当前关键词，展示开头内容。</p><p v-if="preview.truncated">已展示部分内容，打开文件可查看完整内容。</p></template>
    </div>
    <div v-if="preview && !loading && !error" ref="previewText" class="preview-text" @pointerup="captureSelection" @keyup="captureSelection"><SearchHighlight :text="preview.text || '此处暂无可预览的文字。'" :query="query" /></div>
    <div v-if="preview && !loading && !error && (selectedText || copyStatus)" class="excerpt-actions">
      <button type="button" :disabled="!selectedText || copying" @pointerdown.prevent @click="copyExcerpt">复制选中文字及来源</button>
      <small role="status">{{ copyStatus || (selectedText ? `已选 ${selectedText.length} 字` : '先在参考内容中选择需要摘录的文字') }}</small>
    </div>
    <footer><small>参考显示磁盘上的部分内容，不改动当前草稿。选择文字可复制摘录及来源。</small><button type="button" class="preview-open" @click="$emit('open')">在主编辑区打开</button></footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { sourceExcerpt } from '../utils/sourceExcerpt'
import SearchHighlight from './SearchHighlight.vue'
import { searchResultPath } from '../utils/searchResultPath'
const props = defineProps<{ libraryRoot: string; query: string; result: { path: string; title: string; page?: number; annotationId?: string; matchKind: string } }>()
defineEmits<{ close: []; open: []; returnToEditor: [] }>()
interface Preview { text: string; label: string; truncated: boolean; matchFound: boolean }
const panel = ref<HTMLElement | null>(null)
const preview = ref<Preview | null>(null)
const loading = ref(false)
const error = ref('')
const relativePath = computed(() => searchResultPath(props.result.path, props.libraryRoot))
const previewText = ref<HTMLElement | null>(null)
const selectedText = ref('')
const copyStatus = ref('')
const copying = ref(false)
function captureSelection() {
  const selection = window.getSelection()
  const host = previewText.value
  selectedText.value = selection && host && selection.rangeCount
    && host.contains(selection.anchorNode) && host.contains(selection.focusNode)
    ? selection.toString().trim() : ''
  copyStatus.value = ''
}
async function copyExcerpt() {
  if (!selectedText.value || copying.value) return
  const current = generation
  copying.value = true
  try {
    await navigator.clipboard.writeText(sourceExcerpt(selectedText.value, props.result, props.libraryRoot))
    if (current === generation) copyStatus.value = '已复制摘录和来源，可粘贴到笔记中'
  } catch {
    if (current === generation) copyStatus.value = '复制失败，请重试，或手动复制选中文字'
  } finally { copying.value = false }
}
let generation = 0
let returnFocus: HTMLElement | null = null
async function load() {
  const current = ++generation
  selectedText.value = ''; copyStatus.value = ''
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
.search-document-preview.pinned { position: relative; inset: auto; z-index: auto; width: clamp(260px, 30vw, 440px); max-width: 42vw; height: 100%; max-height: 100%; flex: none; border-radius: 0; box-shadow: none; box-sizing: border-box; }
.pinned .preview-text { flex: 1; }
.excerpt-actions { display: grid; gap: 6px; padding: 8px 16px; }
button:disabled { opacity: .5; cursor: default; }
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
footer { flex-wrap: wrap; justify-content: space-between; border-top: var(--theme-border); }
.preview-open { flex-shrink: 0; }
.reference-return { display: none; }
@media (max-width: 760px) {
  .reference-return { display: inline-block; flex-shrink: 0; }
  header, footer { gap: 6px; padding: 8px; }
  .preview-state { padding: 4px 8px; }
  .preview-text { padding: 4px 8px; min-height: 40px; }
}
</style>
