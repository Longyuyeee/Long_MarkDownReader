<template>
  <BatchRenameDialog ref="renameDialog" :library-root="libraryRoot" :before-operate="beforeOperate" :after-operate="afterOperate" />
  <n-modal :show="showTransfer" preset="card" :title="operation === 'move' ? '移动到' : '复制到'" class="file-operation-dialog" :style="modalStyle" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="show => { if (!busy) showTransfer = show }">
    <form class="file-operation-form" @submit.prevent="executeTransfer">
      <p class="file-operation-selection">{{ paths.length === 1 ? filename(paths[0]) : `已选择 ${paths.length} 项` }}</p>
      <label>目标文件夹<div class="directory-field"><n-input v-model:value="target" :disabled="busy" :input-props="{ 'aria-label': '目标文件夹' }" placeholder="资料库内的路径，例如：项目/会议" /><n-button :disabled="busy" @click="chooseDirectory"><FolderOpen :size="16" />选择</n-button></div></label>
      <small>不存在的目录会自动创建；重名时保留两份。</small>
      <div v-if="errors.length" class="operation-errors" role="alert"><p v-for="error in errors" :key="error.path">{{ filename(error.path) }}：{{ error.message }}</p></div>
      <div class="dialog-actions"><n-button :disabled="busy" @click="showTransfer = false">取消</n-button><n-button type="primary" attr-type="submit" :loading="busy">{{ operation === 'move' ? '移动' : '复制' }}{{ errors.length ? '未完成的项目' : '' }}</n-button></div>
    </form>
  </n-modal>
  <n-modal :show="showTrash" preset="card" title="资料库回收站" class="file-operation-dialog" :style="modalStyle" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="show => { if (!busy) showTrash = show }">
    <div class="trash-toolbar"><span>{{ trash.length }} 项</span><n-button size="small" :disabled="busy" :loading="loadingTrash" @click="reloadTrash()"><RefreshCw :size="14" />刷新</n-button></div>
    <div v-if="errors.length" class="operation-errors" role="alert"><p v-for="error in errors" :key="error.path">{{ error.message }}</p></div>
    <p v-if="!loadingTrash && !trash.length" class="empty-label">回收站为空</p>
    <div class="trash-list"><label v-for="entry in trash" :key="entry.id" class="trash-entry"><input type="checkbox" :value="entry.id" v-model="selectedTrash" :disabled="busy" :aria-label="`选择 ${entry.name}`" /><Folder v-if="entry.isDir" :size="18" /><FileText v-else :size="18" /><span><strong>{{ entry.name }}</strong><small>{{ entry.originalPath }}</small></span><time>{{ new Date(entry.deletedAt * 1000).toLocaleDateString() }}</time></label></div>
    <div class="dialog-actions"><n-button :disabled="busy || !selectedTrash.length" @click="purgeSelected">永久删除</n-button><span></span><n-button :disabled="busy" @click="showTrash = false">关闭</n-button><n-button type="primary" :disabled="!selectedTrash.length" :loading="busy" @click="restoreSelected">恢复所选</n-button></div>
  </n-modal>
  <n-modal :show="showFeedback" preset="card" title="部分项目未完成" class="file-operation-dialog" :style="modalStyle" :mask-closable="!busy" :closable="!busy" @update:show="show => { if (!busy) showFeedback = show }">
    <div class="operation-errors" role="alert"><p v-for="error in errors" :key="error.path">{{ filename(error.path) }}：{{ error.message }}</p></div>
    <div class="dialog-actions"><n-button :disabled="busy" @click="showFeedback = false">关闭</n-button><n-button v-if="retryUndo" type="primary" :loading="busy" @click="undoMove">重新撤销</n-button></div>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import BatchRenameDialog from './BatchRenameDialog.vue'
import { NModal, NInput, NButton, useDialog, useMessage } from 'naive-ui'
import { FolderOpen, Folder, FileText, RefreshCw } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { fileOperationBusy as busy, libraryFileClipboard, lastLibraryMove, sameLibrary, topLevelPaths, type FileOperation, type FileOperationResult, type TrashEntry } from '../services/libraryFileOperations'
import { searchResultPath } from '../utils/searchResultPath'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ libraryRoot: string; beforeOperate: (paths: string[], operation: FileOperation) => Promise<boolean>; afterOperate: (result: FileOperationResult, operation: FileOperation) => Promise<void> }>()
const dialog = useDialog(), message = useMessage()
const renameDialog = ref<InstanceType<typeof BatchRenameDialog> | null>(null)
const openRename = (paths: string[]) => renameDialog.value?.open(paths)
const modalStyle = { width: 'min(560px, calc(100vw - 28px))' }
const showTransfer = ref(false), showTrash = ref(false), loadingTrash = ref(false), operation = ref<'move' | 'copy'>('move')
const showFeedback = ref(false), retryUndo = ref(false)
const root = ref(''), paths = ref<string[]>([]), target = ref(''), errors = ref<FileOperationResult['errors']>([]), trash = ref<TrashEntry[]>([]), selectedTrash = ref<string[]>([])
const filename = (path = '') => path.split(/[\\/]/).pop() || path
const isCurrent = (library: string) => sameLibrary(library, props.libraryRoot)
const refreshClipboard = (items: FileOperationResult['items']) => {
  const clipboard = libraryFileClipboard.value
  if (clipboard?.operation === 'move' && sameLibrary(clipboard.root, root.value)) {
    clipboard.paths = clipboard.paths.filter(path => !items.some(item => sameLibrary(path, item.oldPath)))
    if (!clipboard.paths.length) libraryFileClipboard.value = null
  }
}
const publish = async (result: FileOperationResult, kind: FileOperation) => {
  if (kind === 'move' && result.items.length) { lastLibraryMove.value = { root: root.value, items: result.items }; refreshClipboard(result.items) }
  if (isCurrent(root.value) && result.items.length) await props.afterOperate(result, kind)
  errors.value = result.errors
}
const openTransfer = (selection: string[], kind: 'move' | 'copy', directory: string) => {
  if (busy.value) return
  root.value = props.libraryRoot; paths.value = topLevelPaths(selection); operation.value = kind; errors.value = []
  target.value = searchResultPath(directory, root.value) === directory && sameLibrary(directory, root.value) ? '.' : searchResultPath(directory, root.value)
  showTransfer.value = true
}
const chooseDirectory = async () => {
  const library = root.value
  try {
    const selected = await open({ directory: true, multiple: false, defaultPath: library, title: '选择资料库内的文件夹' })
    if (typeof selected === 'string' && isCurrent(library) && sameLibrary(library, root.value)) target.value = sameLibrary(selected, library) ? '.' : searchResultPath(selected, library)
  } catch (cause) { errors.value = [{ path: '', message: String(cause) }] }
}
const executeTransfer = async () => {
  if (busy.value || !isCurrent(root.value) || !await props.beforeOperate(paths.value, operation.value)) return
  busy.value = true; errors.value = []
  const finish = beginWindowSave()
  try {
    const result = await invoke<FileOperationResult>('transfer_library_items', { libraryRoot: root.value, paths: paths.value, targetDir: target.value.trim() || '.', operation: operation.value })
    await publish(result, operation.value)
    if (!result.errors.length) { showTransfer.value = false; message.success(result.items.length ? `已${operation.value === 'move' ? '移动' : '复制'} ${result.items.length} 项` : '项目已在目标目录') }
    else paths.value = result.errors.map(error => error.path)
  } catch (cause) { errors.value = [{ path: '', message: String(cause) }] }
  finally { busy.value = false; finish() }
}
const duplicate = async (selection: string[]) => {
  if (busy.value || !await props.beforeOperate(selection, 'copy')) return
  root.value = props.libraryRoot; busy.value = true
  const finish = beginWindowSave()
  try {
    const result = await invoke<FileOperationResult>('transfer_library_items', { libraryRoot: root.value, paths: topLevelPaths(selection), targetDir: null, operation: 'copy' })
    await publish(result, 'copy')
    if (result.errors.length) { retryUndo.value = false; showFeedback.value = true }
    else message.success(`已创建 ${result.items.length} 个副本`)
  } catch (cause) { message.error(String(cause)) }
  finally { busy.value = false; finish() }
}
const recycle = async (selection: string[]) => {
  if (busy.value || !await props.beforeOperate(selection, 'trash')) return
  root.value = props.libraryRoot
  if (!await confirmAppAction(dialog, { title: '移到回收站？', content: selection.length === 1 ? `“${filename(selection[0])}”可在资料库回收站恢复。` : `${selection.length} 项可在资料库回收站恢复。`, positiveText: '移到回收站' })) return
  if (!isCurrent(root.value) || busy.value || !await props.beforeOperate(selection, 'trash')) return
  busy.value = true
  const finish = beginWindowSave()
  try {
    const result = await invoke<FileOperationResult>('trash_library_items', { libraryRoot: root.value, paths: topLevelPaths(selection) })
    await publish(result, 'trash')
    if (result.errors.length) { showTrash.value = true; await reloadTrash(false) } else message.success(`已移到回收站 ${result.items.length} 项`)
  } catch (cause) { message.error(String(cause)) }
  finally { busy.value = false; finish() }
}
const reloadTrash = async (clearErrors = true) => {
  if (clearErrors) errors.value = []
  loadingTrash.value = true
  try { const entries = await invoke<TrashEntry[]>('list_library_trash', { libraryRoot: root.value }); if (isCurrent(root.value)) { trash.value = entries; selectedTrash.value = selectedTrash.value.filter(id => entries.some(entry => entry.id === id)) } }
  catch (cause) { errors.value = [{ path: '', message: `读取回收站失败：${String(cause)}` }] }
  finally { loadingTrash.value = false }
}
const openTrash = () => { if (busy.value) return; root.value = props.libraryRoot; selectedTrash.value = []; trash.value = []; showTrash.value = true; void reloadTrash() }
const restoreSelected = async () => {
  if (busy.value || !isCurrent(root.value)) return
  busy.value = true
  const finish = beginWindowSave()
  try { const result = await invoke<FileOperationResult>('restore_library_trash', { libraryRoot: root.value, ids: selectedTrash.value }); await publish(result, 'restore'); await reloadTrash(false); if (result.items.length) message.success(`已恢复 ${result.items.length} 项`) }
  catch (cause) { errors.value = [{ path: '', message: String(cause) }] }
  finally { busy.value = false; finish() }
}
const purgeSelected = async () => {
  if (busy.value || !await confirmAppAction(dialog, { title: '永久删除回收项？', content: `删除所选 ${selectedTrash.value.length} 项后，无法再从回收站恢复。`, positiveText: '永久删除', danger: true })) return
  if (!isCurrent(root.value) || busy.value) return
  busy.value = true
  const finish = beginWindowSave()
  try { await invoke('purge_library_trash', { libraryRoot: root.value, ids: selectedTrash.value }); await reloadTrash(); message.success('已永久删除所选项目') }
  catch (cause) { errors.value = [{ path: '', message: String(cause) }] }
  finally { busy.value = false; finish() }
}
const undoMove = async () => {
  const last = lastLibraryMove.value
  if (!last || busy.value || !sameLibrary(last.root, props.libraryRoot) || !await props.beforeOperate(last.items.map(item => item.newPath), 'undo')) return
  root.value = last.root; busy.value = true
  const finish = beginWindowSave()
  try {
    const result = await invoke<FileOperationResult>('undo_library_moves', { libraryRoot: root.value, items: last.items })
    await publish(result, 'undo'); last.items = last.items.filter(item => !result.items.some(change => sameLibrary(change.oldPath, item.newPath)))
    if (!last.items.length) lastLibraryMove.value = null
    if (result.errors.length) { retryUndo.value = true; showFeedback.value = true } else { showFeedback.value = false; message.success('已撤销上次移动') }
  } catch (cause) { message.error(String(cause)) }
  finally { busy.value = false; finish() }
}
watch(() => props.libraryRoot, () => { showTransfer.value = false; showTrash.value = false; showFeedback.value = false })
defineExpose({ openTransfer, openTrash, duplicate, recycle, undoMove, openRename })
</script>

<style scoped>
.file-operation-form, label { display: grid; gap: 8px; min-width: 0; }.file-operation-form { gap: 14px; }.file-operation-selection { margin: 0; overflow-wrap: anywhere; }.directory-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }small, time, .empty-label { color: var(--theme-text-secondary); font-size: var(--text-compact); }.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }.dialog-actions > span { flex: 1; }.operation-errors { max-height: 36vh; overflow: auto; padding: 9px; background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); overflow-wrap: anywhere; }.operation-errors p { margin: 4px 0; }.trash-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }.trash-list { max-height: 50vh; overflow: auto; display: grid; gap: 6px; }.trash-entry { display: flex; align-items: center; gap: 8px; padding: 10px 7px; background: var(--file-row-bg, var(--theme-surface)); border: var(--file-row-border); border-radius: var(--theme-radius-sm); }.trash-entry > span { min-width: 0; flex: 1; display: grid; gap: 4px; }.trash-entry strong, .trash-entry small { overflow-wrap: anywhere; }.trash-entry > svg, .trash-entry > input { flex-shrink: 0; }.trash-entry time { flex-shrink: 0; }.trash-entry input:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
</style>
