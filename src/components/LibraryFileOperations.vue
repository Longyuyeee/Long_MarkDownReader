<template>
  <FileOperationHistoryDialog ref="historyDialog" :library-root="libraryRoot" :before-operate="beforeOperate" :after-operate="afterOperate" @review="id => recoveryId = id" />
  <FileMoveRecoveryDialog :library-root="libraryRoot" :recovery-id="recoveryId" @close="recoveryId = ''" @resolved="finishReview" />
  <BatchRenameDialog ref="renameDialog" :library-root="libraryRoot" :before-operate="beforeOperate" :after-operate="afterOperate" />
  <n-modal :show="showTransfer" preset="card" :title="operation === 'move' ? '移动到' : '复制到'" class="file-operation-dialog" :style="modalStyle" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="show => { if (!busy) showTransfer = show }">
    <form class="file-operation-form" @submit.prevent="executeTransfer">
      <p class="file-operation-selection">{{ errors.length ? `待重试 ${paths.length} 项` : paths.length === 1 ? filename(paths[0]) : `已选择 ${paths.length} 项` }}</p>
      <label v-if="operation === 'copy' && libraryOptions.length > 1">目标资料库<n-select :value="targetRoot" :options="libraryOptions" :disabled="busy || crossLocked" :consistent-menu-width="false" :aria-label="'目标资料库'" @update:value="chooseLibrary" /></label>
      <label>目标文件夹<div class="directory-field"><n-input v-model:value="target" :disabled="busy || crossLocked" :input-props="{ 'aria-label': '目标文件夹' }" placeholder="资料库内的路径，例如：项目/会议" /><n-button :disabled="busy || crossLocked" @click="chooseDirectory"><FolderOpen :size="16" />选择</n-button></div></label>
      <WorkspaceHelp label="说明：不存在的目录会自动创建；重名时保留两" text="不存在的目录会自动创建；重名时保留两份。" />
      <p v-if="inputError" class="operation-errors" role="alert">{{ inputError }}</p>
      <CrossLibraryCopyPanel v-if="crossLibrary" :active="showTransfer && isCurrent(root)" :source-root="root" :target-root="targetRoot" :paths="paths" :target-dir="target" :before-copy="beforeCrossCopy" :after-copy="afterCrossCopy" @close="showTransfer = false" @lock="crossLocked = $event" />
      <template v-else>
      <FileOperationOutcome v-if="errors.length" :completed="completedItems" :errors="errors" :operation="operation" @review="id => recoveryId = id" />
      <div class="dialog-actions"><n-button :disabled="busy" @click="showTransfer = false">{{ errors.length ? '关闭' : '取消' }}</n-button><n-button v-if="!errors.length || paths.length" type="primary" attr-type="submit" :loading="busy">{{ errors.length && operation === 'move' ? `重试未执行的 ${paths.length} 项` : `${operation === 'move' ? '移动' : '复制'}${errors.length ? '未完成的项目' : ''}` }}</n-button></div>
      </template>
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
    <FileOperationOutcome :completed="completedItems" :errors="errors" :operation="feedbackOperation" @review="id => recoveryId = id" />
    <div class="dialog-actions"><n-button :disabled="busy" @click="showFeedback = false">关闭</n-button><n-button v-if="retryUndo && lastLibraryMove?.items.length" type="primary" :loading="busy" @click="undoMove">重试未执行的 {{ lastLibraryMove.items.length }} 项</n-button></div>
  </n-modal>
</template>

<script setup lang="ts">
import WorkspaceHelp from './workspace/WorkspaceHelp.vue'
import { computed, ref, watch } from 'vue'
import BatchRenameDialog from './BatchRenameDialog.vue'
import FileOperationOutcome from './FileOperationOutcome.vue'
import FileMoveRecoveryDialog from './FileMoveRecoveryDialog.vue'
import CrossLibraryCopyPanel from './CrossLibraryCopyPanel.vue'
import FileOperationHistoryDialog from './FileOperationHistoryDialog.vue'
import { NModal, NInput, NSelect, NButton, useDialog, useMessage } from 'naive-ui'
import { FolderOpen, Folder, FileText, RefreshCw } from 'lucide-vue-next'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { confirmAppAction } from '../services/appDialog'
import { fileOperationBusy as busy, libraryFileClipboard, lastLibraryMove, sameLibrary, topLevelPaths, canRetryFileError, mergeFileErrors, type FileOperation, type FileOperationResult, type TrashEntry, type PathChange } from '../services/libraryFileOperations'
import { searchResultPath } from '../utils/searchResultPath'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ libraryRoot: string; libraries?: {name:string;path:string}[]; beforeOperate: (paths: string[], operation: FileOperation) => Promise<boolean>; afterOperate: (result: FileOperationResult, operation: FileOperation) => Promise<void>; afterCrossCopy?: (result:FileOperationResult,targetRoot:string)=>Promise<void> }>()
const dialog = useDialog(), message = useMessage()
const renameDialog = ref<InstanceType<typeof BatchRenameDialog> | null>(null)
const historyDialog = ref<InstanceType<typeof FileOperationHistoryDialog> | null>(null)
const openHistory = () => historyDialog.value?.open()
const recoveryId = ref('')
const feedbackOperation = ref<FileOperation>('copy')
const showMoveOutcome = (result: FileOperationResult) => { root.value = props.libraryRoot; completedItems.value = [...result.items]; errors.value = result.errors; feedbackOperation.value = 'move'; retryUndo.value = false; showFeedback.value = true }
const openRecovery = () => { if (!busy.value) recoveryId.value = 'pending' }
const finishReview = (id: string) => { errors.value = errors.value.filter(error => error.recoveryId !== id); recoveryId.value = ''; void historyDialog.value?.refresh(); message.success('已完成文件位置核对') }
const openRename = (paths: string[]) => renameDialog.value?.open(paths)
const modalStyle = { width: 'min(560px, calc(100vw - 28px))' }
const showTransfer = ref(false), showTrash = ref(false), loadingTrash = ref(false), operation = ref<'move' | 'copy'>('move')
const showFeedback = ref(false), retryUndo = ref(false)
const root = ref(''), paths = ref<string[]>([]), target = ref(''), errors = ref<FileOperationResult['errors']>([]), trash = ref<TrashEntry[]>([]), selectedTrash = ref<string[]>([])
const completedItems = ref<PathChange[]>([])
const inputError = ref('')
const targetRoot=ref(''),crossLocked=ref(false)
const crossLibrary=computed(()=>operation.value==='copy'&&!sameLibrary(root.value,targetRoot.value))
const libraryOptions=computed(()=>[...(props.libraries||[]).map(library=>({label:library.name+(sameLibrary(library.path,root.value)?'（当前）':''),value:library.path})),...((props.libraries||[]).some(library=>sameLibrary(library.path,root.value))?[]:[{label:'当前资料库',value:root.value}])])
const chooseLibrary=(value:string)=>{if(busy.value||crossLocked.value)return;targetRoot.value=value;target.value='.';inputError.value=''}
const beforeCrossCopy=()=>props.beforeOperate([...paths.value],'copy-saved')
const afterCrossCopy=(result:FileOperationResult,library:string)=>props.afterCrossCopy?.(result,library)||Promise.resolve()
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
  if (kind === 'move' && result.items.length) { lastLibraryMove.value = { root: root.value, items: [...completedItems.value, ...result.items] }; refreshClipboard(result.items) }
  errors.value = result.errors
  if (isCurrent(root.value) && result.items.length) {
    try { await props.afterOperate(result, kind) }
    catch { message.warning('文件操作结果已保留，但界面刷新未完成；请刷新资料库核对显示，不要重复操作已完成项。') }
  }
}
const openTransfer = (selection: string[], kind: 'move' | 'copy', directory: string) => {
  if (busy.value) return
  root.value = props.libraryRoot; paths.value = topLevelPaths(selection); operation.value = kind; errors.value = []; completedItems.value = []; inputError.value = ''
  targetRoot.value=root.value;crossLocked.value=false
  target.value = searchResultPath(directory, root.value) === directory && sameLibrary(directory, root.value) ? '.' : searchResultPath(directory, root.value)
  showTransfer.value = true
}
const chooseDirectory = async () => {
  const library = targetRoot.value, source=root.value
  inputError.value = ''
  try {
    const selected = await open({ directory: true, multiple: false, defaultPath: library, title: '选择资料库内的文件夹' })
    if (typeof selected === 'string' && isCurrent(source) && sameLibrary(library, targetRoot.value)) target.value = sameLibrary(selected, library) ? '.' : searchResultPath(selected, library)
  } catch (cause) { inputError.value = `选择文件夹失败，尚未执行文件操作：${String(cause)}` }
}
const executeTransfer = async () => {
  if(crossLibrary.value)return
  if (busy.value || !paths.value.length || !isCurrent(root.value) || !await props.beforeOperate(paths.value, operation.value)) return
  if (busy.value || !showTransfer.value || !isCurrent(root.value)) return
  const retained = errors.value.filter(error => !canRetryFileError(error, operation.value))
  const attempted = [...paths.value]
  busy.value = true
  const finish = beginWindowSave(operation.value === 'move' ? 'relocation' : 'save')
  try {
    const result = await invoke<FileOperationResult>('transfer_library_items', { libraryRoot: root.value, paths: paths.value, targetDir: target.value.trim() || '.', operation: operation.value })
    await publish(result, operation.value)
    completedItems.value.push(...result.items)
    errors.value = mergeFileErrors(retained, result.errors)
    paths.value = result.errors.filter(error => canRetryFileError(error, operation.value)).map(error => error.path)
    if (!errors.value.length) { showTransfer.value = false; message.success(result.items.length ? `已${operation.value === 'move' ? '移动' : '复制'} ${result.items.length} 项` : '项目已在目标目录') }
  } catch (cause) {
    errors.value = mergeFileErrors(retained, attempted.map(path => ({ path, message: `未收到完整操作结果：${String(cause)}`, disposition: 'needsReview' as const })))
    if (operation.value === 'move') paths.value = []
  }
  finally { busy.value = false; finish() }
}
const duplicate = async (selection: string[]) => {
  feedbackOperation.value = 'copy'
  if (busy.value || !await props.beforeOperate(selection, 'copy')) return
  root.value = props.libraryRoot; busy.value = true; completedItems.value = []
  const finish = beginWindowSave()
  try {
    const result = await invoke<FileOperationResult>('transfer_library_items', { libraryRoot: root.value, paths: topLevelPaths(selection), targetDir: null, operation: 'copy' })
    await publish(result, 'copy')
    completedItems.value = result.items
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
  if (!lastLibraryMove.value || !sameLibrary(lastLibraryMove.value.root, props.libraryRoot)) { await historyDialog.value?.open(true); return }
  feedbackOperation.value = 'undo'
  const last = lastLibraryMove.value
  if (!last || busy.value || !sameLibrary(last.root, props.libraryRoot) || !await props.beforeOperate(last.items.map(item => item.newPath), 'undo')) return
  if (busy.value || last !== lastLibraryMove.value || !sameLibrary(last.root, props.libraryRoot)) return
  const retained = showFeedback.value && retryUndo.value ? errors.value.filter(error => !canRetryFileError(error, 'undo')) : []
  if (!showFeedback.value || !retryUndo.value) completedItems.value = []
  const attempted = [...last.items]
  root.value = last.root; busy.value = true
  const finish = beginWindowSave('relocation')
  try {
    const result = await invoke<FileOperationResult>('undo_library_moves', { libraryRoot: root.value, items: last.items })
    await publish(result, 'undo'); completedItems.value.push(...result.items)
    errors.value = mergeFileErrors(retained, result.errors)
    last.items = last.items.filter(item => result.errors.some(error => sameLibrary(error.path, item.newPath) && canRetryFileError(error, 'undo')))
    if (!last.items.length) lastLibraryMove.value = null
    if (errors.value.length) { retryUndo.value = true; showFeedback.value = true } else { showFeedback.value = false; message.success('已撤销上次移动') }
  } catch (cause) {
    errors.value = mergeFileErrors(retained, attempted.map(item => ({ path: item.newPath, message: `未收到完整操作结果：${String(cause)}`, disposition: 'needsReview' as const })))
    lastLibraryMove.value = null; retryUndo.value = true; showFeedback.value = true
  }
  finally { busy.value = false; finish() }
}
watch(() => props.libraryRoot, () => { showTransfer.value = false; showTrash.value = false; showFeedback.value = false })
defineExpose({ openTransfer, openTrash, duplicate, recycle, undoMove, openRename, openRecovery, openHistory, showMoveOutcome })
</script>

<style scoped>
.file-operation-form, label { display: grid; gap: 8px; min-width: 0; }.file-operation-form { gap: 14px; }.file-operation-selection { margin: 0; overflow-wrap: anywhere; }.directory-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }small, time, .empty-label { color: var(--theme-text-secondary); font-size: var(--text-compact); }.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }.dialog-actions > span { flex: 1; }.operation-errors { max-height: 36vh; overflow: auto; padding: 9px; background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); overflow-wrap: anywhere; }.operation-errors p { margin: 4px 0; }.trash-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }.trash-list { max-height: 50vh; overflow: auto; display: grid; gap: 6px; }.trash-entry { display: flex; align-items: center; gap: 8px; padding: 10px 7px; background: var(--file-row-bg, var(--theme-surface)); border: var(--file-row-border); border-radius: var(--theme-radius-sm); }.trash-entry > span { min-width: 0; flex: 1; display: grid; gap: 4px; }.trash-entry strong, .trash-entry small { overflow-wrap: anywhere; }.trash-entry > svg, .trash-entry > input { flex-shrink: 0; }.trash-entry time { flex-shrink: 0; }.trash-entry input:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
</style>
