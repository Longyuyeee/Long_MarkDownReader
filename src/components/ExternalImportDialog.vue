<template>
  <n-modal :show="show" preset="card" title="导入资料" class="external-import-dialog" :style="{ width: 'min(660px, calc(100vw - 28px))' }" :closable="!busy" :mask-closable="!busy" :close-on-esc="!busy" @update:show="value => { if (!busy) show = value }">
    <p class="import-target">目标：{{ target }}</p>
    <div class="import-results" aria-live="polite">
      <div v-for="item in completed" :key="item.oldPath" class="import-result"><div><strong>{{ filename(item.oldPath) }}</strong><small>{{ item.newPath }}</small></div><span class="import-done">已完成</span></div>
      <div v-for="item in failures" :key="item.path" class="import-result"><div><strong>{{ filename(item.path) }}</strong><small class="import-error">{{ item.message }}</small></div><span class="import-error">未完成</span></div>
    </div>
    <p class="import-note">已完成的项目不会再次导入。补齐图片或修正问题后，可只重试未完成项。</p>
    <p v-if="refreshError" class="import-error" role="alert">{{ refreshError }}</p>
    <template #footer><div class="import-actions"><n-button :disabled="busy" @click="show = false">关闭</n-button><n-button v-if="failures.length" type="primary" :loading="busy" @click="run">重试未完成的 {{ failures.length }} 项</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NModal, useMessage } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { beginWindowSave } from '../services/windowDrafts'
import { fileOperationBusy as busy, sameLibrary, type FileOperationResult, type PathChange } from '../services/libraryFileOperations'
const props = defineProps<{ libraryRoot: string; afterImport: (result: FileOperationResult, directory: string) => Promise<void> }>()
const message = useMessage(), show = ref(false), root = ref(''), target = ref(''), originals = ref<string[]>([])
const completed = ref<PathChange[]>([]), failures = ref<FileOperationResult['errors']>([]), refreshError = ref('')
const filename = (path: string) => path.split(/[\\/]/).pop() || path
let disposed = false, generation = 0
async function run() {
  if (busy.value || !sameLibrary(root.value, props.libraryRoot) || !failures.value.length) return
  const token = ++generation, selected = failures.value.map(item => item.path), library = root.value, directory = target.value
  const current = () => !disposed && token === generation && sameLibrary(library, props.libraryRoot)
  busy.value = true; refreshError.value = ''
  const finish = beginWindowSave(), notice = message.loading(`正在导入 ${selected.length} 份资料…`, { duration: 0 })
  try {
    const result = await invoke<FileOperationResult>('import_library_files', { sourcePaths: selected, libraryRoot: library, targetDir: directory })
    if (!current()) return
    completed.value = [...completed.value, ...result.items].sort((a, b) => originals.value.indexOf(a.oldPath) - originals.value.indexOf(b.oldPath))
    failures.value = result.errors
    show.value = Boolean(result.errors.length)
    if (result.items.length) {
      try { await props.afterImport({ items: [...completed.value], errors: result.errors }, directory) }
      catch { if (current()) { refreshError.value = '资料已导入，但列表刷新未完成。请刷新目录，不要重复导入已完成项。'; show.value = true } }
    }
    if (current() && !result.errors.length) message.success(`已导入 ${completed.value.length} 份资料`)
  } catch (cause) {
    if (current()) { failures.value = selected.map(path => ({ path, message: String(cause) })); show.value = true }
  } finally { notice.destroy(); busy.value = false; finish() }
}
async function open(paths: string[], directory: string) {
  if (busy.value) { message.info('文件操作正在执行，请稍候'); return }
  originals.value = [...new Set(paths)]; root.value = props.libraryRoot; target.value = directory
  completed.value = []; failures.value = originals.value.map(path => ({ path, message: '' })); refreshError.value = ''; show.value = false
  await run()
}
watch(() => props.libraryRoot, () => { ++generation; show.value = false; completed.value = []; failures.value = [] })
onBeforeUnmount(() => { disposed = true; ++generation })
defineExpose({ open })
</script>
<style scoped>
.import-target,.import-note{color:var(--theme-text-secondary);overflow-wrap:anywhere}.import-results{max-height:48vh;overflow:auto}.import-result{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:var(--theme-border)}.import-result>div{flex:1;min-width:0}.import-result strong,.import-result small{display:block;overflow-wrap:anywhere}.import-result small{margin-top:4px;color:var(--theme-text-secondary)}.import-result>span{flex-shrink:0}.import-done{color:var(--status-success)}.import-error,.import-result small.import-error{color:var(--status-danger)}.import-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.import-note{font-size:var(--text-compact)}
</style>
