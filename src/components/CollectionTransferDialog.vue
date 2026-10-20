<template>
  <n-modal :show="true" preset="card" :title="mode === 'import' ? '导入集合条件' : '导出集合条件'" class="collection-transfer-dialog" :style="{ width: 'min(820px, 94vw)' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @close="close" @update:show="value => { if (!value) close() }">
    <div class="transfer-body">
      <p class="transfer-hint">{{ mode === 'import' ? '添加为新的集合，保留原集合。只复用查找条件，不复制或移动文件。' : '只导出名称和条件，不包含文件内容或资料库绝对路径。' }}</p>
      <div v-if="mode === 'import'" class="transfer-target"><label>导入到<select v-model="targetRoot" aria-label="导入到" :disabled="busy"><option v-for="library in store.libraries" :key="library.path" :value="library.path">{{ library.name }}</option></select></label><n-button :disabled="busy" @click="chooseFile">{{ rows.length ? '换一个条件文件…' : '选择条件文件…' }}</n-button></div>
      <details v-if="mode === 'import'" class="paste-conditions" :open="pasting" @toggle="pasting = ($event.target as HTMLDetailsElement).open"><summary>粘贴集合条件…</summary><textarea v-model="pasted" aria-label="集合条件文本" :disabled="busy" placeholder="粘贴导出的集合 JSON" /><n-button :disabled="busy || !pasted.trim()" @click="readPasted">读入预览</n-button></details>
      <p v-if="!rows.length" class="transfer-hint">{{ mode === 'import' ? '选择在其他项目导出的集合 JSON 文件。' : '当前没有可导出的集合。' }}</p>
      <div v-for="(row, index) in rows" :key="index" class="transfer-row">
        <div class="row-heading"><input v-model="row.selected" type="checkbox" :aria-label="`选择集合 ${row.entry.name}`" :disabled="busy" /><strong>{{ row.entry.name || '未命名集合' }}</strong><span v-if="mode === 'import'" :class="{ invalid: row.valid === false }">{{ row.valid === true ? '可导入' : row.valid === false ? '需调整' : '待检查' }}</span></div>
        <p v-if="mode === 'export'" class="transfer-hint">{{ row.entry.graphRoot ? `中心文件：${row.entry.graphRoot}` : row.entry.filters?.directory || '整个资料库' }}<template v-if="row.entry.query && !row.entry.graphRoot"> · {{ row.entry.query }}</template></p>
        <details v-else :open="row.valid === false" class="row-conditions"><summary>修改名称与条件</summary>
          <div class="condition-grid"><label>导入后的名称<input v-model="row.entry.name" aria-label="导入后的名称" :disabled="busy" maxlength="80" /></label>
            <label v-if="row.entry.graphRoot !== undefined">中心文件<div class="path-field"><input v-model="row.entry.graphRoot" aria-label="中心文件" :disabled="busy" /><button :disabled="busy" aria-label="选择中心文件" @click="choosePath(row, true)"><FolderOpen :size="16" /></button></div></label>
            <template v-else><label>关键词<input v-model="row.entry.query" aria-label="集合关键词" :disabled="busy" maxlength="500" /></label><label>文件夹<div class="path-field"><input :value="row.entry.filters?.directory || ''" aria-label="导入文件夹" :disabled="busy" placeholder="整个目标资料库" @input="setDirectory(row, ($event.target as HTMLInputElement).value)" /><button :disabled="busy" aria-label="选择导入文件夹" @click="choosePath(row, false)"><FolderOpen :size="16" /></button></div></label>
              <label>笔记标签<input v-model="row.tags" aria-label="导入标签条件" :disabled="busy" placeholder="多个标签同时满足" /></label><label>修改时间（天）<input v-model="row.days" type="number" aria-label="导入修改时间" :disabled="busy" placeholder="不限" min="1" max="3650" /></label>
              <label class="type-field">文件类型<n-select v-model:value="row.entry.objectTypes" multiple clearable :disabled="busy" :options="typeOptions(row)" placeholder="不限类型" /></label></template>
            <label v-if="row.entry.graphRoot !== undefined">关系深度<input v-model.number="row.entry.graphDepth" type="number" aria-label="导入图谱深度" :disabled="busy" min="1" max="4" /></label>
          </div>
        </details>
        <p v-if="row.message" class="transfer-hint" :role="row.valid === false ? 'alert' : undefined">{{ row.message }}</p>
      </div>
      <p v-if="error" role="alert" class="transfer-error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    </div>
    <template #footer><div class="transfer-footer"><span>已选 {{ selectedCount }} 个</span><n-button :disabled="busy" @click="close">取消</n-button><n-button v-if="mode === 'import'" :loading="busy" :disabled="busy || !selectedCount" @click="check">检查条件</n-button><n-button type="primary" :loading="busy" :disabled="busy || !selectedCount || (mode === 'import' && !ready)" @click="apply">{{ mode === 'import' ? `导入 ${selectedCount} 个集合` : '导出所选集合…' }}</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NModal, NButton, NSelect } from 'naive-ui'
import { FolderOpen } from 'lucide-vue-next'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { useAppStore, type SavedSearchConfig } from '../store/app'
import { beginWindowSave } from '../services/windowDrafts'
import { portableCollection, planCollectionNames, type PortableCollection, type CollectionBundle } from '../utils/collectionTransfer'
import { sameWorkspacePath, toCollectionRelativePath } from '../utils/savedCollections'
import { splitFilterTags } from '../services/libraryNavigationPreferences'
const props = defineProps<{ mode: 'import' | 'export'; entries: SavedSearchConfig[]; formats: { label: string; value: string }[] }>()
const emit = defineEmits<{ close: []; completed: [message: string] }>(), store = useAppStore(), ownerRoot = store.libraryPath
interface Row { entry: PortableCollection; selected: boolean; tags: string; days: string | number; valid: boolean | null; message: string }
const makeRow = (entry: PortableCollection): Row => ({ entry: portableCollection(entry), selected: true, tags: [entry.filters?.tag, ...(entry.filters?.tags || [])].filter(Boolean).join(' '), days: entry.filters?.modifiedWithinDays ?? '', valid: null, message: '' })
const rows = ref<Row[]>(props.mode === 'export' ? props.entries.map(makeRow) : []), targetRoot = ref(ownerRoot), busy = ref(false), error = ref(''), notice = ref('')
let generation = 0, disposed = false, checkTimer: ReturnType<typeof setTimeout> | undefined
const current = () => !disposed && sameWorkspacePath(ownerRoot, store.libraryPath)
const value = (row: Row): PortableCollection => {
  const result = portableCollection(row.entry)
  if (props.mode === 'export') return result
  if (result.graphRoot === undefined) {
    const tags = splitFilterTags(row.tags)
    result.filters = { directory: result.filters?.directory || '', tag: tags[0] || '', ...(tags.length > 1 ? { tags: tags.slice(1) } : {}), modifiedWithinDays: row.days === '' ? null : Number(row.days) }
  }
  return result
}
const fingerprint = () => JSON.stringify({ target: targetRoot.value, rows: rows.value.map(row => ({ selected: row.selected, value: value(row) })) })
const checked = ref(''), selectedCount = computed(() => rows.value.filter(row => row.selected).length)
const pasted = ref(''), pasting = ref(false)
const ready = computed(() => checked.value === fingerprint() && rows.value.filter(row => row.selected).every(row => row.valid === true))
const typeOptions = (row: Row) => [...props.formats, ...row.entry.objectTypes.filter(id => !props.formats.some(f => f.value === id)).map(id => ({ label: `不支持的类型：${id}（可移除）`, value: id }))]
const close = () => { if (!busy.value) emit('close') }
const setDirectory = (row: Row, directory: string) => { row.entry.filters = { directory, tag: row.entry.filters?.tag || '', modifiedWithinDays: row.entry.filters?.modifiedWithinDays ?? null, tags: row.entry.filters?.tags } }
const installBundle = (bundle: CollectionBundle) => { rows.value = planCollectionNames(bundle.collections, store.savedSearches.filter(entry => sameWorkspacePath(entry.libraryPath, targetRoot.value)).map(entry => entry.name)).map(makeRow) }
async function readPasted() {
  if (busy.value || !current()) return
  busy.value = true; error.value = ''; notice.value = ''
  try { const bundle = await invoke<CollectionBundle>('parse_collection_bundle', { content: pasted.value }); if (current()) { installBundle(bundle); pasted.value = ''; pasting.value = false } }
  catch (cause) { if (current()) error.value = String(cause) }
  finally { busy.value = false }
  if (rows.value.length && current()) await check()
}
async function chooseFile() {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''; const token = ++generation
  try {
    const source = await open({ title: '选择集合条件文件', multiple: false, directory: false, filters: [{ name: 'Long编辑集合条件', extensions: ['json'] }] })
    if (typeof source !== 'string' || !current() || token !== generation) return
    const bundle = await invoke<CollectionBundle>('read_collection_bundle', { sourcePath: source })
    if (!current() || token !== generation) return
    installBundle(bundle)
  } catch (cause) { if (current()) error.value = String(cause) }
  finally { busy.value = false }
  if (rows.value.length && current()) await check()
}
async function choosePath(row: Row, file: boolean) {
  if (busy.value) return
  busy.value = true; error.value = ''; const root = targetRoot.value
  try {
    const path = await open({ title: file ? '选择目标资料库中的中心文件' : '选择目标资料库中的文件夹', directory: !file, multiple: false, defaultPath: root, ...(file ? { filters: [{ name: '图谱中心', extensions: ['md', 'markdown', 'pdf'] }] } : {}) })
    if (typeof path !== 'string' || !current() || root !== targetRoot.value) return
    const relative = sameWorkspacePath(root, path) ? '' : toCollectionRelativePath(root, path)
    if (file) row.entry.graphRoot = relative; else setDirectory(row, relative)
  } catch (cause) { if (current()) error.value = `请选择目标资料库中的位置：${String(cause)}` }
  finally { busy.value = false }
}
async function check() {
  if (busy.value || !selectedCount.value || !current()) return
  busy.value = true; error.value = ''; notice.value = ''; checked.value = ''
  const before = fingerprint(), root = targetRoot.value, active = rows.value.map((row, index) => ({ row, index })).filter(item => item.row.selected), entries = active.map(item => value(item.row))
  try {
    const result = await invoke<{ index: number; valid: boolean; message: string }[]>('preview_collection_import', { libraryRoot: root, collections: entries })
    if (!current() || before !== fingerprint()) return
    const byIndex = new Map(active.map((item, index) => [item.index, result[index]]))
    const names = new Set(store.savedSearches.filter(entry => sameWorkspacePath(entry.libraryPath, root)).map(entry => entry.name.toLocaleLowerCase()))
    rows.value.forEach((row, index) => {
      if (!row.selected) return
      const item = byIndex.get(index)
      const duplicate = row.selected && names.has(row.entry.name.trim().toLocaleLowerCase())
      row.valid = Boolean(item?.valid) && !duplicate
      row.message = duplicate ? '目标已有同名集合，请修改名称；原集合会保留。' : item?.message || '未取得检查结果'
      if (row.selected) names.add(row.entry.name.trim().toLocaleLowerCase())
    })
    if (store.savedSearches.length + selectedCount.value > 64) { error.value = `本机还可添加 ${Math.max(0, 64 - store.savedSearches.length)} 个集合，请减少选择`; return }
    checked.value = before
    notice.value = rows.value.some(row => row.selected && !row.valid) ? '可取消勾选失效集合，或调整条件后重新检查。' : '所选条件可导入，文件与原集合保持不变。'
  } catch (cause) { if (current()) error.value = String(cause) }
  finally { busy.value = false }
}
async function apply() {
  if (busy.value || !selectedCount.value || !current()) return
  if (props.mode === 'import' && !ready.value) return
  busy.value = true; error.value = ''; const finish = beginWindowSave()
  try {
    const entries = rows.value.filter(row => row.selected).map(value)
    if (props.mode === 'export') {
      const path = await save({ title: '导出集合条件', defaultPath: 'LongEdit-集合条件.json', filters: [{ name: 'Long编辑集合条件', extensions: ['json'] }] })
      if (!path || !current()) return
      await invoke('export_collection_bundle', { targetPath: path, collections: entries })
    } else {
      // Recheck live paths immediately before committing, without creating them.
      const result = await invoke<{ valid: boolean }[]>('preview_collection_import', { libraryRoot: targetRoot.value, collections: entries })
      if (!current()) return
      if (result.some(row => !row.valid)) { checked.value = ''; throw Error('目标位置或条件已有变化，请重新检查；尚未导入') }
      await store.importSmartCollections(targetRoot.value, entries, ownerRoot)
    }
    if (current()) emit('completed', props.mode === 'import' ? `已添加 ${entries.length} 个集合，原集合已保留` : `已导出 ${entries.length} 个集合的条件`)
  } catch (cause) { if (current()) error.value = String(cause) }
  finally { busy.value = false; finish() }
}
watch(() => store.libraryPath, () => { ++generation; if (!busy.value) close() })
watch(targetRoot, () => { checked.value = ''; notice.value = ''; rows.value.forEach(row => { row.valid = null; row.message = '' }) })
watch(fingerprint, () => {
  if (props.mode !== 'import') return
  checked.value = ''; clearTimeout(checkTimer)
  checkTimer = setTimeout(() => { if (current() && !busy.value && rows.value.length) void check() }, 350)
})
watch(busy, value => { if (!value && !current() && !disposed) emit('close') })
onBeforeUnmount(() => { disposed = true; ++generation; clearTimeout(checkTimer) })
</script>
<style scoped>
.paste-conditions { margin: 12px 0; }.paste-conditions textarea { display: block; box-sizing: border-box; width: 100%; height: 120px; margin: 8px 0; padding: 9px; resize: vertical; color: var(--theme-text); background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); font-family: var(--font-mono, monospace); }
.transfer-body { max-height: 65vh; overflow: auto; color: var(--theme-text); }.transfer-hint { color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.6; overflow-wrap: anywhere; }.transfer-target, .transfer-footer { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }.transfer-target>label { flex: 1; }.transfer-row { padding: 12px 0; border-bottom: var(--theme-border); }.row-heading { display: flex; align-items: center; gap: 9px; }.row-heading strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }.row-heading span { color: var(--theme-primary); font-size: var(--text-compact); }.row-heading .invalid { color: var(--status-danger, var(--theme-text)); }.row-conditions { margin: 10px 0 0 24px; }summary { cursor: pointer; font-size: var(--text-compact); color: var(--theme-primary); }.condition-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }label { display: grid; gap: 6px; font-size: var(--text-compact); min-width: 0; }input:not([type=checkbox]), select { min-width: 0; width: 100%; box-sizing: border-box; padding: 7px 9px; min-height: 34px; font: inherit; border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-surface); }.path-field { display: flex; gap: 5px; }.path-field button { border: var(--theme-border); border-radius: var(--theme-radius-sm); color: var(--theme-text); background: var(--theme-surface); cursor: pointer; }.type-field { grid-column: 1/-1; }.transfer-footer>span { margin-right: auto; color: var(--theme-text-secondary); font-size: var(--text-compact); }.transfer-error { overflow-wrap: anywhere; color: var(--status-danger, var(--theme-text)); }input[type=checkbox] { accent-color: var(--theme-primary); }input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }@media(max-width:560px) { .condition-grid { grid-template-columns: 1fr; }.row-conditions { margin-left: 0; } }
</style>
