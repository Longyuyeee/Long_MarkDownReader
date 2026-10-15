<template>
  <n-modal :show="!comparison" preset="card" title="文本历史与差异" :style="{ width: 'min(600px, 94vw)' }" @update:show="value => { if (!value) $emit('close') }">
    <p v-if="loading">正在读取历史…</p><p v-else-if="!entries.length && !error">暂无历史。保存文本时会保留修改前后的版本。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="text-history-entries"><button v-for="[timestamp, content] in entries" :key="timestamp" @click="compare(timestamp)"><Clock :size="16" /><span><strong>{{ new Date(timestamp * 1000).toLocaleString() }}</strong><small>{{ content.slice(0, 140) || '空白文本' }}</small></span><ChevronRight :size="16" /></button></div>
    <template #footer><n-button @click="$emit('close')">关闭</n-button></template>
  </n-modal>
  <HistoryDiffDialog v-if="comparison" :path="path" :timestamp="comparison.timestamp" :draft="comparison.draft" :disk="comparison.disk" :historical="comparison.content" :busy="busy" :error="actionError" @close="comparison = null" @copy="recover('copy')" @replace="recover('replace')" />
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NModal, useDialog } from 'naive-ui'
import { Clock, ChevronRight } from 'lucide-vue-next'
import { invoke } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { beginWindowSave } from '../services/windowDrafts'
import HistoryDiffDialog from './HistoryDiffDialog.vue'
const props = defineProps<{ libraryRoot: string; path: string; draft: string; maxCount: number }>()
const emit = defineEmits<{ close: []; replace: [content: string]; copy: [path: string] }>()
const entries = ref<[number, string][]>([]), loading = ref(false), error = ref(''), actionError = ref(''), busy = ref(false)
const comparison = ref<{ timestamp: number; draft: string; disk: string; content: string; diskSignature: string; historySignature: string } | null>(null)
const dialog = useDialog()
let disposed = false, generation = 0
async function load() {
  loading.value = true
  try { const result = await invoke<[number, string][]>('list_history', { libraryRoot: props.libraryRoot, path: props.path }); if (!disposed) entries.value = result }
  catch (cause) { if (!disposed) error.value = '历史暂时无法读取：' + String(cause) }
  finally { loading.value = false }
}
const compare = async (timestamp: number) => {
  const token = ++generation, draft = props.draft
  try { const result = await invoke<Omit<NonNullable<typeof comparison.value>, 'timestamp' | 'draft'>>('compare_history_version', { libraryRoot: props.libraryRoot, path: props.path, timestamp }); if (!disposed && token === generation) { comparison.value = { ...result, timestamp, draft }; actionError.value = '' } }
  catch (cause) { if (!disposed && token === generation) error.value = '未能比较历史：' + String(cause) }
}
const recover = async (mode: 'copy' | 'replace') => {
  const selected = comparison.value
  if (!selected || busy.value) return
  const current = () => !disposed && comparison.value === selected && props.draft === selected.draft
  if (!current()) { actionError.value = '当前内容已变化，请重新比较'; return }
  busy.value = true; actionError.value = ''; const finish = beginWindowSave()
  try {
    if (mode === 'replace' && !await confirmAppAction(dialog, { title: '替换当前编辑区？', content: '会先保留当前草稿，再载入历史内容。仍需点击保存才会写回文件。', positiveText: '保护草稿并替换' })) return
    if (!current()) throw new Error('内容已变化，请重新比较')
    const args = { libraryRoot: props.libraryRoot, path: props.path, timestamp: selected.timestamp, diskSignature: selected.diskSignature, historySignature: selected.historySignature }
    if (mode === 'copy') { const path = await invoke<string>('restore_history_copy', args); if (current()) emit('copy', path) }
    else { const content = await invoke<string>('prepare_history_restore', { ...args, currentDraft: selected.draft, maxCount: props.maxCount }); if (current()) emit('replace', content) }
    if (current()) emit('close')
  } catch (cause) { if (!disposed) actionError.value = '恢复未完成：' + String(cause) }
  finally { busy.value = false; finish() }
}
onMounted(load)
onBeforeUnmount(() => { disposed = true; ++generation })
</script>
<style scoped>
.text-history-entries { max-height: 55vh; overflow: auto; display: grid; gap: 8px; }button { display: flex; align-items: center; gap: 12px; padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-surface); cursor: pointer; text-align: left; }button>span { display: grid; gap: 5px; min-width: 0; flex: 1; }small { color: var(--theme-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }[role=alert] { color: var(--status-danger); }
</style>
