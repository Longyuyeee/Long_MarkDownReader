<template>
  <n-modal :show="true" preset="card" title="文件已在其他地方修改" class="text-conflict-dialog" :style="{ width: 'min(940px,94vw)' }" :mask-closable="false" :closable="!busy" :close-on-esc="!busy" @close="$emit('close')" @update:show="value => { if (!value) $emit('close') }">
    <div class="conflict-identity"><strong>{{ path.split(/[\\/]/).pop() }}</strong><span>当前编辑内容仍保留</span></div>
    <p v-if="loading" role="status">正在读取磁盘最新内容…</p>
    <TextDiff v-else-if="snapshot" :current="draft" :target="snapshot.content" current-label="当前编辑内容" target-label="磁盘最新内容" :busy="busy" />
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="conflict-actions"><n-button v-if="!snapshot || error" :disabled="busy" :loading="loading" @click="read">重新比较</n-button><n-button :disabled="busy || loading || !snapshot" :loading="busy && action === 'reload'" @click="resolve('reload')">使用磁盘版本</n-button><n-button :disabled="busy || loading || !snapshot" :loading="busy && action === 'copy'" @click="resolve('copy')">另存当前副本</n-button><n-button type="primary" :disabled="busy" @click="$emit('close')">继续编辑</n-button></div>
    <p class="conflict-hint">{{ libraryRoot ? '使用磁盘版本前先将当前草稿保留在历史中。' : '使用磁盘版本前，先将当前草稿保留为同目录副本。' }}另存副本保留两份文件。</p>
  </n-modal>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NModal } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { beginWindowSave } from '../services/windowDrafts'
import TextDiff from './TextDiff.vue'
export interface ConflictSnapshot { content: string; signature: string; contentDigest: string; encoding: string; bom: string; lineEnding: string; hasFinalNewline: boolean; size: number; modified: number; readOnlyReason?: string | null; path: string; encodingConfidence?: string }
const props = defineProps<{ path: string; libraryRoot?: string; draft: string; formatId: string; readEncoding?: string; savePolicy?: Record<string, unknown>; isCurrent: () => boolean }>()
const emit = defineEmits<{ close: []; reload: [snapshot: ConflictSnapshot, protectedCopy?: string]; copy: [path: string] }>()
const loading = ref(false), busy = ref(false), error = ref(''), action = ref(''), snapshot = ref<ConflictSnapshot | null>(null)
let disposed = false, generation = 0
const args = () => ({ path: props.path, ...(props.libraryRoot ? { libraryRoot: props.libraryRoot } : {}), formatId: props.formatId, readOptions: props.readEncoding ? { encoding: props.readEncoding } : undefined })
const errorText = (cause: unknown) => (cause as { message?: string })?.message || String(cause)
const read = async () => {
  const token = ++generation; loading.value = true; error.value = ''; snapshot.value = null
  try {
    const result = await invoke<ConflictSnapshot>(props.libraryRoot ? 'read_text_document' : 'read_external_text_document', args())
    if (!disposed && token === generation) snapshot.value = result
  } catch (cause) { if (!disposed && token === generation) error.value = `暂时无法比较：${errorText(cause)}` }
  finally { if (!disposed && token === generation) loading.value = false }
}
const resolve = async (mode: 'reload' | 'copy') => {
  if (!snapshot.value || busy.value || loading.value) return
  if (!props.isCurrent()) { error.value = '编辑内容或文件已变化，请关闭后重新比较。当前修改仍保留。'; return }
  const draft = props.draft, signature = snapshot.value.signature
  busy.value = true; action.value = mode; error.value = ''; const finish = beginWindowSave()
  try {
    const result = await invoke<{ snapshot: ConflictSnapshot; copyPath: string | null }>('resolve_text_conflict', { ...args(), libraryRoot: props.libraryRoot || null, expectedSignature: signature, currentDraft: draft, action: mode, savePolicy: props.savePolicy })
    if (disposed) return
    if (!props.isCurrent()) { error.value = result.copyPath ? `副本已创建：${result.copyPath}；新增编辑仍保留。` : '草稿已保留为历史；编辑内容已变化，未替换。请关闭后重新比较。'; return }
    if (mode === 'reload') emit('reload', result.snapshot, result.copyPath || undefined)
    else if (result.copyPath) emit('copy', result.copyPath)
  } catch (cause) { if (!disposed) error.value = errorText(cause) }
  finally { busy.value = false; finish() }
}
onMounted(read)
onBeforeUnmount(() => { disposed = true; ++generation })
</script>
<style scoped>
.conflict-identity{display:flex;gap:12px;flex-wrap:wrap;overflow-wrap:anywhere}.conflict-identity span,.conflict-hint{color:var(--theme-text-secondary);font-size:var(--text-sm)}.conflict-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:20px}[role=alert]{color:var(--status-danger)}
</style>
