<template>
  <FileMoveRecoveryDialog :library-root="libraryRoot" :recovery-id="recoveryId" @close="recoveryId = ''" @resolved="finishReview" />
  <n-modal :show="show" preset="card" title="批量重命名" class="batch-rename-dialog" :style="{ width: 'min(780px, calc(100vw - 28px))' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="value => { if (!busy) show = value }">
    <form @submit.prevent="execute">
      <div class="rename-rule">
        <label>修改方式<n-select v-model:value="rule.mode" :disabled="busy" :options="modes" :consistent-menu-width="false" /></label>
        <template v-if="rule.mode === 'text'"><label>名称前添加<n-input v-model:value="rule.prefix" :disabled="busy" :input-props="{ 'aria-label': '名称前添加' }" placeholder="例如：项目-" /></label><label>名称后添加<n-input v-model:value="rule.suffix" :disabled="busy" :input-props="{ 'aria-label': '名称后添加' }" placeholder="例如：-定稿" /></label></template>
        <template v-else-if="rule.mode === 'replace'"><label>查找文字<n-input v-model:value="rule.find" :disabled="busy" :input-props="{ 'aria-label': '查找文字' }" /></label><label>替换为<n-input v-model:value="rule.replacement" :disabled="busy" :input-props="{ 'aria-label': '替换为' }" placeholder="留空则删除找到的文字" /></label></template>
        <template v-else><label>起始序号<n-input-number v-model:value="rule.start" :disabled="busy" :min="0" :max="99999999" :precision="0" /></label><label>最少位数<n-input-number v-model:value="rule.digits" :disabled="busy" :min="1" :max="8" :precision="0" /></label><label>序号位置<n-select v-model:value="rule.position" :disabled="busy" :options="positions" /></label></template>
      </div>
      <div class="rename-summary"><span>{{ rows.length }} 项 · 保留文件扩展名</span><span v-if="previewing">正在预览…</span><span v-else>{{ ready.length }} 项可修改<span v-if="completed"> · {{ completed }} 项已完成</span><span v-if="reviewCount"> · {{ reviewCount }} 项需核对</span></span></div>
      <p v-if="reviewCount" class="rename-review-note">需核对项保留原结果和记录，不会随重试或规则调整再次修改。</p>
      <p v-if="error" class="rename-error" role="alert">{{ error }}</p>
      <div class="rename-preview" :aria-busy="previewing">
        <div class="rename-head"><span>原名称</span><span>新名称</span></div>
        <div v-for="row in rows" :key="row.path" class="rename-row" :class="{ 'has-error': row.status === 'error' || row.status === 'review', 'needs-review': row.status === 'review', completed: row.status === 'done' }">
          <span class="rename-old">{{ filename(row.path) }}<small v-if="multipleParents">{{ relativeParent(row.path) }}</small></span><span><strong>{{ row.newName }}</strong><small v-if="row.message">{{ row.message }}</small><n-button v-if="row.recoveryId" size="small" @click="recoveryId = row.recoveryId">核对状态…</n-button><small v-else-if="row.status === 'done'">已完成</small></span>
        </div>
      </div>
      <div class="rename-actions"><n-button :disabled="busy || previewing || !pending.length" @click="refresh">刷新预览</n-button><span></span><n-button :disabled="busy" @click="show = false">{{ reviewCount ? '关闭' : completed ? '完成' : '取消' }}</n-button><n-button v-if="!attemptedOnce || ready.length" type="primary" attr-type="submit" :disabled="previewing || !ready.length" :loading="busy">{{ attemptedOnce ? `重试未执行的 ${ready.length} 项` : `重命名 ${ready.length} 项` }}</n-button></div>
    </form>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { NModal, NButton, NInput, NSelect, NInputNumber } from 'naive-ui'
import FileMoveRecoveryDialog from './FileMoveRecoveryDialog.vue'
import { invoke } from '../services/tauriRuntime'
import { fileOperationBusy as busy, sameLibrary, topLevelPaths, fileParent, canRetryFileError, type FileOperation, type FileOperationResult } from '../services/libraryFileOperations'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ libraryRoot: string; beforeOperate: (paths: string[], operation: FileOperation) => Promise<boolean>; afterOperate: (result: FileOperationResult, operation: FileOperation) => Promise<void> }>()
type Row = { path: string; newName: string; status: 'ready' | 'unchanged' | 'error' | 'done' | 'review'; message: string; recoveryId?: string }
const show = ref(false), root = ref(''), pending = ref<string[]>([]), rows = ref<Row[]>([]), previewing = ref(false), error = ref('')
const attemptedOnce = ref(false)
const recoveryId = ref('')
const finishReview = (id: string) => { for (const row of rows.value) if (row.recoveryId === id) { row.message = '已核对，按当前位置保留'; row.recoveryId = undefined } recoveryId.value = '' }
const rule = reactive({ mode: 'text', prefix: '', suffix: '', find: '', replacement: '', start: 1 as number | null, digits: 2 as number | null, position: 'prefix' })
const modes = [{ label: '添加文字', value: 'text' }, { label: '查找替换', value: 'replace' }, { label: '添加序号', value: 'number' }]
const positions = [{ label: '名称前', value: 'prefix' }, { label: '名称后', value: 'suffix' }]
const ready = computed(() => rows.value.filter(row => row.status === 'ready'))
const completed = computed(() => rows.value.filter(row => row.status === 'done').length)
const reviewCount = computed(() => rows.value.filter(row => row.status === 'review').length)
const multipleParents = computed(() => new Set(rows.value.map(row => fileParent(row.path))).size > 1)
const filename = (path: string) => path.split(/[\\/]/).pop() || path
const relativeParent = (path: string) => fileParent(path).replace(/\\/g, '/').slice(root.value.replace(/\\/g, '/').length + 1) || '资料库根目录'
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined
const refresh = async () => {
  clearTimeout(timer)
  const token = ++generation
  if (!show.value || busy.value) return
  previewing.value = true; error.value = ''
  try {
    const next = await invoke<Row[]>('preview_library_renames', { libraryRoot: root.value, paths: pending.value, rule: { ...rule, start: rule.start ?? 1, digits: rule.digits ?? 2 } })
    if (token === generation && show.value) rows.value = [...rows.value.filter(row => row.status === 'done' || row.status === 'review'), ...next]
  } catch (cause) { if (token === generation) { error.value = `无法预览：${String(cause)}`; rows.value = rows.value.filter(row => row.status === 'done' || row.status === 'review') } }
  finally { if (token === generation) previewing.value = false }
}
watch(rule, () => { if (!show.value || busy.value) return; ++generation; previewing.value = true; clearTimeout(timer); timer = setTimeout(refresh, 180) })
const open = (paths: string[]) => {
  if (busy.value) return
  clearTimeout(timer); ++generation
  Object.assign(rule, { mode: 'text', prefix: '', suffix: '', find: '', replacement: '', start: 1, digits: 2, position: 'prefix' })
  root.value = props.libraryRoot; pending.value = topLevelPaths(paths); rows.value = []; error.value = ''; attemptedOnce.value = false; show.value = true
  void refresh()
}
const execute = async () => {
  if (busy.value || previewing.value || !ready.value.length || !sameLibrary(root.value, props.libraryRoot)) return
  const selected = ready.value.map(row => ({ path: row.path, newName: row.newName }))
  if (!await props.beforeOperate(selected.map(row => row.path), 'rename') || !show.value || !sameLibrary(root.value, props.libraryRoot) || busy.value) return
  busy.value = true; error.value = ''; attemptedOnce.value = true
  const finish = beginWindowSave('relocation')
  try {
    const result = await invoke<FileOperationResult>('rename_library_items', { libraryRoot: root.value, items: selected })
    for (const row of rows.value) {
      const done = result.items.find(item => sameLibrary(item.oldPath, row.path)), failed = result.errors.find(item => sameLibrary(item.path, row.path))
      if (done) { row.status = 'done'; row.message = ''; pending.value = pending.value.filter(path => !sameLibrary(path, row.path)) }
      else if (failed) {
        const retryable = canRetryFileError(failed, 'rename')
        row.status = retryable ? 'ready' : 'review'
        row.recoveryId = failed.recoveryId
        row.message = `${retryable ? '未执行' : '需核对'} · ${failed.message}${failed.recoveryId ? `（核对记录：${failed.recoveryId}）` : ''}`
        if (!retryable) pending.value = pending.value.filter(path => !sameLibrary(path, row.path))
      } else if (selected.some(item => sameLibrary(item.path, row.path))) {
        row.status = 'review'; row.message = '需核对 · 未返回此项的完整结果，不直接重试。'
        pending.value = pending.value.filter(path => !sameLibrary(path, row.path))
      }
    }
    if (sameLibrary(root.value, props.libraryRoot) && result.items.length) {
      try { await props.afterOperate(result, 'rename') }
      catch { error.value = '重命名结果已保留，但界面刷新未完成；请刷新资料库核对显示，不要重复操作已完成项。' }
    }
    if (result.errors.length || reviewCount.value) error.value = `${completed.value} 项已完成，${ready.value.length} 项未执行，${reviewCount.value} 项需核对。只重试明确未执行的项目；需核对项保留记录，不重复修改。`
  } catch (cause) {
    for (const row of rows.value) if (row.status !== 'done' && selected.some(item => sameLibrary(item.path, row.path))) {
      row.status = 'review'; row.message = `需核对 · 未收到完整结果：${String(cause)}`
      pending.value = pending.value.filter(path => !sameLibrary(path, row.path))
    }
    error.value = '未收到完整重命名结果，请先核对文件状态；这些项目不会直接重试。'
  }
  finally { busy.value = false; finish() }
}
watch(() => props.libraryRoot, () => { show.value = false })
watch(show, value => { if (!value) { clearTimeout(timer); ++generation; previewing.value = false } })
onBeforeUnmount(() => { clearTimeout(timer); ++generation })
defineExpose({ open })
</script>
<style scoped>
.rename-review-note { color: var(--theme-text-secondary); font-size: var(--text-compact); }.needs-review small { color: var(--theme-warning, #a66a17); }
.rename-rule { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.rename-rule label { display: grid; gap: 6px; min-width: 0; }.rename-rule label:first-child { grid-column: 1 / -1; }.rename-summary { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin: 16px 0 8px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.rename-preview { max-height: 44vh; overflow: auto; border: var(--theme-border); border-radius: var(--theme-radius-sm); }.rename-head, .rename-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; padding: 10px 12px; }.rename-head { color: var(--theme-text-secondary); background: var(--theme-surface); position: sticky; top: 0; }.rename-row { border-top: var(--theme-border); }.rename-row > span { min-width: 0; overflow-wrap: anywhere; }.rename-row strong { font-weight: 500; }.rename-row small { display: block; margin-top: 4px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.has-error small, .rename-error { color: var(--theme-error, #d03050); }.completed strong { color: var(--theme-primary); }.rename-error { overflow-wrap: anywhere; }.rename-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }.rename-actions > span { flex: 1; }@media (max-width: 600px) { .rename-rule { grid-template-columns: minmax(0, 1fr); gap: 8px; }.rename-preview { max-height: 32vh; }.rename-head, .rename-row { padding: 8px; gap: 8px; } }
</style>
