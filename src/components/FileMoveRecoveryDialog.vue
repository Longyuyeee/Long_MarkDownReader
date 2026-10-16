<template>
  <n-modal :show="Boolean(recoveryId)" preset="card" title="核对文件位置" class="file-move-recovery-dialog" :style="{ width: 'min(580px, calc(100vw - 28px))' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="value => { if (!value && !busy) emit('close') }">
    <n-spin :show="loading">
      <div v-if="!selectedId" class="recovery-list"><p v-if="!loading && !entries.length && !error">没有需要核对的移动。</p><n-button v-for="entry in entries" :key="entry.id" block @click="selectedId = entry.id; load()">{{ entry.oldPath.split(/[\\/]/).pop() }} → {{ entry.newPath.split(/[\\/]/).pop() }}</n-button></div>
      <div v-if="review" class="recovery-details"><p>{{ review.summary }}</p><dl><dt>原位置</dt><dd>{{ review.oldPath }}</dd><dt>新位置</dt><dd>{{ review.newPath }}</dd></dl></div>
      <p v-if="error" class="recovery-error" role="alert">{{ error }}</p>
      <p v-if="exported" class="recovery-exported" role="status">原文副本已保存到：{{ exported }}</p>
    </n-spin>
    <div class="recovery-actions"><n-button :disabled="busy" @click="emit('close')">稍后处理</n-button><n-button v-if="review?.canExport" :disabled="busy" @click="exportOriginals">导出原文副本…</n-button><n-button v-if="review?.canRestore" :disabled="busy" @click="resolve(true)">还原本次移动</n-button><n-button v-if="review?.canFinish" type="primary" :loading="busy" @click="resolve(false)">按当前位置完成核对</n-button><n-button v-if="!review" :disabled="busy || loading" @click="load">重新读取</n-button></div>
  </n-modal>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton, NSpin } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { beginWindowSave } from '../services/windowDrafts'
import { fileOperationBusy as busy } from '../services/libraryFileOperations'
import { open } from '@tauri-apps/plugin-dialog'
const props = defineProps<{ libraryRoot: string; recoveryId: string }>()
const emit = defineEmits<{ close: []; resolved: [id: string] }>()
const loading = ref(false), error = ref(''), exported = ref(''), review = ref<{ oldPath: string; newPath: string; summary: string; canFinish: boolean; canRestore: boolean; canExport: boolean } | null>(null)
const selectedId = ref(''), entries = ref<{ id: string; oldPath: string; newPath: string }[]>([])
let generation = 0
const load = async () => {
  const token = ++generation; if (!props.recoveryId) return
  loading.value = true; error.value = ''; exported.value = ''; review.value = null
    try {
      if (!selectedId.value) { const result = await invoke<typeof entries.value>('list_library_move_recoveries', { libraryRoot: props.libraryRoot }); if (token === generation) entries.value = result }
      else { const result = await invoke<typeof review.value>('review_library_move', { libraryRoot: props.libraryRoot, recoveryId: selectedId.value }); if (token === generation) review.value = result }
    }
  catch (cause) { if (token === generation) error.value = `暂时无法自动核对，原文件和原文记录已保留：${String(cause)}` }
  finally { if (token === generation) loading.value = false }
}
const resolve = async (restore: boolean) => {
  if (busy.value || !review.value) return
  const id = selectedId.value, root = props.libraryRoot
  busy.value = true; error.value = ''; const finish = beginWindowSave('relocation')
  try { await invoke('resolve_library_move', { libraryRoot: root, recoveryId: id, restore }); if (root === props.libraryRoot && id === selectedId.value) emit('resolved', id) }
  catch (cause) { error.value = `尚未完成核对，请保留原文件和记录：${String(cause)}` }
  finally { busy.value = false; finish() }
}
const exportOriginals = async () => {
  const id = selectedId.value, root = props.libraryRoot
  try {
    const target = await open({ directory: true, multiple: false, defaultPath: root, title: '选择原文副本保存位置' })
    if (typeof target !== 'string' || id !== selectedId.value || root !== props.libraryRoot || busy.value) return
    busy.value = true; error.value = ''; const finish = beginWindowSave()
    try { exported.value = await invoke<string>('export_library_move_originals', { libraryRoot: root, recoveryId: id, targetDir: target }) }
    finally { busy.value = false; finish() }
  } catch (cause) { error.value = `未能导出全部副本，原记录仍保留：${String(cause)}` }
}
watch(() => [props.recoveryId, props.libraryRoot], () => { selectedId.value = props.recoveryId === 'pending' ? '' : props.recoveryId; entries.value = []; if (props.recoveryId) void load(); else { ++generation; review.value = null } }, { immediate: true })
</script>
<style scoped>
.recovery-exported { overflow-wrap: anywhere; }
.recovery-details p { margin-top: 0; }.recovery-details dl { display: grid; gap: 5px; padding: 12px; border: var(--theme-border); border-radius: var(--theme-radius-sm); background: var(--theme-surface); }.recovery-details dt { color: var(--theme-text-secondary); font-size: var(--text-compact); }.recovery-details dd { margin: 0 0 8px; overflow-wrap: anywhere; }.recovery-error { color: var(--theme-error, #d03050); overflow-wrap: anywhere; }.recovery-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
</style>
