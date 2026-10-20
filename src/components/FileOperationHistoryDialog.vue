<template>
  <n-modal :show="visible" preset="card" title="最近操作" class="file-history-dialog" :style="{ width: 'min(760px, calc(100vw - 28px))' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="close">
    <div class="history-toolbar">
      <n-input v-model:value="query" clearable placeholder="查找文件名或路径" :input-props="{ 'aria-label': '查找操作记录' }"><template #prefix><Search :size="16" /></template></n-input>
      <n-button :disabled="busy" :loading="loading" aria-label="刷新操作记录" @click="load()"><RefreshCw :size="16" /></n-button>
      <n-dropdown trigger="click" :options="[{ label: '清除已结束的记录…', key: 'clear', disabled: busy || !records.some(r => r.status !== 'needsReview') }]" @select="clearRecords"><n-button :disabled="busy" aria-label="操作记录菜单"><MoreHorizontal :size="16" /></n-button></n-dropdown>
    </div>
    <p v-if="error" class="history-error" role="alert">{{ error }}</p>
    <div v-if="!loading && !records.length" class="history-empty"><History :size="28" /><strong>还没有整理记录</strong><span>从本版开始，移动、改名和复制会记在这里。</span></div>
    <p v-else-if="!loading && !filtered.length" class="history-empty">没有匹配的操作</p>
    <div v-if="records.length" class="history-content">
      <div class="history-list" aria-label="文件操作记录" :aria-busy="loading">
        <button v-for="item in filtered" :key="item.id" :data-operation-id="item.id" type="button" class="history-item" :class="{ selected: selected?.id === item.id }" :aria-pressed="selected?.id === item.id" @click="selectedId = item.id">
          <component :is="item.action === 'copy' ? Copy : item.action === 'rename' ? Pencil : item.action === 'undo' ? Undo2 : FolderInput" :size="18" />
          <span><strong>{{ filename(item.newPath) }}</strong><small>{{ actions[item.action] || '整理' }} · {{ new Date(item.time).toLocaleString() }}</small></span>
          <small class="history-status" :class="item.status">{{ statuses[item.status] || '待核对' }}</small>
        </button>
      </div>
      <section v-if="selected" class="history-detail" aria-label="所选操作详情">
        <dl><dt>原位置</dt><dd>{{ selected.oldPath }}</dd><dt>操作后位置</dt><dd>{{ selected.newPath }}</dd></dl>
        <p v-if="selected.note" class="history-note">{{ selected.note }}</p>
        <div class="history-actions">
          <n-button :disabled="busy" @click="locate"><FolderOpen :size="16" />查看文件位置</n-button>
          <n-button v-if="selected.status === 'needsReview' && selected.recoveryId" :disabled="busy" @click="emit('review', selected.recoveryId)">核对这次移动…</n-button>
          <n-button v-if="selected.canRestore" type="primary" :loading="busy" @click="restore"><Undo2 :size="16" />还原此项</n-button>
        </div>
      </section>
    </div>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal, NInput, NButton, NDropdown, useDialog, useMessage } from 'naive-ui'
import { Search, RefreshCw, MoreHorizontal, History, Copy, Pencil, Undo2, FolderInput, FolderOpen } from 'lucide-vue-next'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { invoke } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { beginWindowSave } from '../services/windowDrafts'
import { fileOperationBusy as busy, lastLibraryMove, sameLibrary, type FileOperation, type FileOperationResult } from '../services/libraryFileOperations'
interface HistoryItem { id: string; time: number; action: string; oldPath: string; newPath: string; targetRoot: string; status: string; recoveryId: string | null; note: string; canRestore: boolean }
const props = defineProps<{ libraryRoot: string; beforeOperate: (paths: string[], operation: FileOperation) => Promise<boolean>; afterOperate: (result: FileOperationResult, operation: FileOperation) => Promise<void> }>()
const emit = defineEmits<{ review: [id: string] }>()
const message = useMessage(), dialog = useDialog()
const visible = ref(false), loading = ref(false), error = ref(''), query = ref(''), selectedId = ref(''), records = ref<HistoryItem[]>([])
const actions: Record<string, string> = { move: '移动', rename: '改名', copy: '复制', undo: '还原' }
const statuses: Record<string, string> = { completed: '已完成', restored: '已还原', notExecuted: '未执行', needsReview: '待核对' }
const filename = (path: string) => path.split(/[\\/]/).pop() || path
const filtered = computed(() => { const q = query.value.trim().toLocaleLowerCase(); return records.value.filter(r => !q || `${r.oldPath}\n${r.newPath}`.toLocaleLowerCase().includes(q)) })
const selected = computed(() => filtered.value.find(r => r.id === selectedId.value) || filtered.value[0])
let generation = 0
const load = async (preserveError = false) => {
  if (!visible.value) return
  if (!preserveError) error.value = ''
  const token = ++generation, root = props.libraryRoot
  loading.value = true
  try { const result = await invoke<HistoryItem[]>('list_library_file_operations', { libraryRoot: root }); if (token === generation && visible.value) records.value = result }
  catch (cause) { if (token === generation) error.value = `操作记录暂时无法读取，文件不受影响：${String(cause)}` }
  finally { if (token === generation) loading.value = false }
}
const open = async (lastMove = false) => {
  if (busy.value) return
  visible.value = true; error.value = ''; query.value = ''; records.value = []; selectedId.value = ''
  await load()
  if (lastMove) selectedId.value = records.value.find(r => r.action === 'move' && r.canRestore)?.id || ''
}
const close = (show: boolean) => { if (!busy.value && !show) { visible.value = false; ++generation; loading.value = false } }
const locate = async () => {
  const item = selected.value, root = props.libraryRoot; if (!item) return
  error.value = ''
  try { const path = await invoke<string>('locate_library_file_operation', { libraryRoot: root, operationId: item.id }); await revealItemInDir(path) }
  catch (cause) { if (root === props.libraryRoot) error.value = String(cause) }
}
const restore = async () => {
  const item = selected.value, root = props.libraryRoot
  if (!item || busy.value || !await props.beforeOperate([item.newPath, item.oldPath], 'undo') || root !== props.libraryRoot || busy.value) return
  busy.value = true; error.value = ''; const finish = beginWindowSave('relocation')
  try {
    const result = await invoke<FileOperationResult>('restore_library_file_operation', { libraryRoot: root, operationId: item.id })
    const last = lastLibraryMove.value
    if (last && sameLibrary(last.root, root)) {
      last.items = last.items.filter(move => !result.items.some(change => sameLibrary(change.oldPath, move.newPath) && sameLibrary(change.newPath, move.oldPath)))
      if (!last.items.length) lastLibraryMove.value = null
    }
    if (root === props.libraryRoot) {
      try { await props.afterOperate(result, 'undo') } catch { message.warning('文件已还原，界面刷新未完成；可刷新资料库查看，请勿重复还原') }
      message.success('已还原此项，其他记录保留')
    }
  } catch (cause) { if (root === props.libraryRoot) error.value = `未能自动还原：${String(cause)}。可查看文件位置；如有未完成移动，请从文件栏右键核对。` }
  finally { busy.value = false; finish(); if (root === props.libraryRoot && visible.value) await load(true) }
}
const clearRecords = async () => {
  const root = props.libraryRoot
  if (busy.value || !await confirmAppAction(dialog, { title: '清除已结束的记录？', content: '只清除已结束的操作记录；文件和未完成移动的核对材料都会保留。', positiveText: '清除记录' }) || busy.value || root !== props.libraryRoot) return
  busy.value = true; error.value = ''
  try { await invoke('clear_library_file_operations', { libraryRoot: root }); if (lastLibraryMove.value && sameLibrary(lastLibraryMove.value.root, root)) lastLibraryMove.value = null; if (root === props.libraryRoot) await load() }
  catch (cause) { error.value = String(cause) }
  finally { busy.value = false }
}
watch(() => props.libraryRoot, () => { visible.value = false; records.value = []; ++generation; loading.value = false })
defineExpose({ open, refresh: load })
</script>
<style scoped>
.history-toolbar{display:flex;gap:8px;margin-bottom:12px}.history-toolbar>.n-input{flex:1}.history-content{display:grid;gap:12px}.history-list{max-height:39vh;overflow:auto;display:grid;gap:5px}.history-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px;text-align:left;color:var(--theme-text);background:var(--theme-surface);border:1px solid transparent;border-radius:var(--theme-radius-sm);cursor:pointer}.history-item:hover{background:var(--theme-background)}.history-item.selected{border-color:var(--theme-primary);background:color-mix(in srgb,var(--theme-primary) 10%,var(--theme-surface))}.history-item>svg{flex-shrink:0;color:var(--theme-primary)}.history-item>span{display:grid;gap:3px;flex:1;min-width:0}.history-item strong{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.history-item small,.history-note,.history-detail dt{color:var(--theme-text-secondary);font-size:var(--text-compact)}.history-status{flex-shrink:0}.history-status.needsReview,.history-error{color:var(--theme-error,#d03050)}.history-detail{padding:12px;background:var(--theme-surface);border:var(--theme-border);border-radius:var(--theme-radius-sm)}.history-detail dl{margin:0;display:grid;gap:5px}.history-detail dd{margin:0 0 6px;overflow-wrap:anywhere;font-size:var(--text-compact)}.history-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:12px}.history-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:30px 10px;color:var(--theme-text-secondary);text-align:center}.history-error{overflow-wrap:anywhere}.history-item:focus-visible{outline:2px solid var(--theme-primary);outline-offset:-2px}
</style>
