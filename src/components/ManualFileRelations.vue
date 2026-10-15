<template>
  <section class="manual-file-relations" aria-label="手动资料关系">
    <div class="manual-heading"><strong>资料关系</strong><small>{{ relations.length }}</small><button aria-label="刷新资料关系" :disabled="loading" @click="load"><RefreshCw :size="14" /></button></div>
    <p v-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
    <p v-else-if="loading" role="status">正在读取关系…</p>
    <p v-else-if="!relations.length" class="manual-empty">暂无手动关系</p>
    <article v-for="entry in relations" :key="entry.id">
      <button class="manual-peer" @click="$emit('open', peer(entry))"><File :size="16" /><span><strong>{{ peer(entry).split(/[\\/]/).pop() }}</strong><small>{{ label(entry.relationType) }} · {{ entry.relationType === 'related' ? '相互关联' : sameWorkspacePath(path, entry.sourcePath) ? '从当前文件出发' : '指向当前文件' }}</small><small v-if="entry.note">{{ entry.note }}</small></span></button>
      <n-dropdown trigger="click" :options="[{ label: '编辑类型和说明…', key: 'edit' }, { label: '移除关系', key: 'remove' }]" @select="key => action(String(key), entry)"><button :aria-label="'关系操作 ' + peer(entry).split(/[\\/]/).pop()" :disabled="busy"><MoreHorizontal :size="16" /></button></n-dropdown>
    </article>
    <n-modal :show="Boolean(editing)" preset="card" title="编辑资料关系" :style="{ width: 'min(480px, 94vw)' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="value => { if (!value && !busy) editing = null }">
      <form class="manual-edit-form" @submit.prevent="save"><label>关系类型<select v-model="kind" aria-label="编辑关系类型" :disabled="busy"><option v-for="item in fileRelationTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label>说明<textarea v-model="note" aria-label="编辑关系说明" maxlength="2000" rows="4" :disabled="busy" /></label><p v-if="editError" role="alert">{{ editError }}</p><div><n-button :disabled="busy" @click="editing = null">取消</n-button><n-button type="primary" attr-type="submit" :loading="busy">保存修改</n-button></div></form>
    </n-modal>
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NDropdown, NModal } from 'naive-ui'
import { File, MoreHorizontal, RefreshCw } from 'lucide-vue-next'
import { invoke } from '../services/tauriRuntime'
import { announceFileRelationsChanged, onFileRelationsChanged, fileRelationTypes, type FileRelation } from '../services/fileRelations'
import { sameWorkspacePath } from '../utils/savedCollections'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ path: string; libraryRoot: string }>()
defineEmits<{ open: [path: string] }>()
const relations = ref<FileRelation[]>([]), loading = ref(false), busy = ref(false), error = ref(''), editError = ref('')
const editing = ref<FileRelation | null>(null), kind = ref('related'), note = ref('')
const peer = (entry: FileRelation) => sameWorkspacePath(props.path, entry.sourcePath) ? entry.targetPath : entry.sourcePath
const label = (kind: string) => fileRelationTypes.find(item => item.value === kind)?.label || kind
let generation = 0
async function load() {
  const token = ++generation
  relations.value = []; error.value = ''
  if (!props.path || !props.libraryRoot) return
  loading.value = true
  try { const entries = await invoke<FileRelation[]>('list_file_relations', { libraryRoot: props.libraryRoot, path: props.path }); if (token === generation) relations.value = entries }
  catch (cause) { if (token === generation) error.value = '暂时无法读取关系：' + String(cause) }
  finally { if (token === generation) loading.value = false }
}
const action = async (key: string, entry: FileRelation) => {
  if (busy.value) return
  if (key === 'edit') { editing.value = entry; kind.value = entry.relationType; note.value = entry.note; editError.value = ''; return }
  busy.value = true; const end = beginWindowSave(), root = props.libraryRoot
  try { await invoke('remove_file_relation', { libraryRoot: root, relationId: entry.id }); announceFileRelationsChanged(root) }
  catch (cause) { error.value = '关系未移除，请重试：' + String(cause) }
  finally { busy.value = false; end() }
}
const save = async () => {
  if (!editing.value || busy.value) return
  busy.value = true; editError.value = ''; const end = beginWindowSave(), root = props.libraryRoot, entry = editing.value
  try { await invoke('update_file_relation', { libraryRoot: root, relationId: entry.id, relationType: kind.value, note: note.value }); announceFileRelationsChanged(root); if (editing.value === entry) editing.value = null }
  catch (cause) { if (editing.value === entry) editError.value = '修改未保存，输入已保留：' + String(cause) }
  finally { busy.value = false; end() }
}
const stop = onFileRelationsChanged(root => { if (root === props.libraryRoot) void load() })
watch(() => [props.path, props.libraryRoot], () => { editing.value = null; void load() }, { immediate: true })
onBeforeUnmount(() => { ++generation; stop() })
</script>
<style scoped>
.manual-file-relations { margin-bottom: 14px; }.manual-heading { display: flex; align-items: center; gap: 8px; }.manual-heading small { color: var(--theme-primary); }.manual-heading button { margin-left: auto; }.manual-empty { color: var(--theme-text-secondary); font-size: var(--text-compact); }article { display: flex; align-items: center; gap: 4px; border-bottom: var(--theme-border); }button { background: transparent; color: var(--theme-text); border: 0; border-radius: var(--theme-radius-sm); padding: 7px; cursor: pointer; }.manual-peer { display: flex; align-items: start; gap: 8px; flex: 1; min-width: 0; text-align: left; }.manual-peer>span { display: grid; gap: 4px; min-width: 0; }.manual-peer strong { font-size: var(--text-sm); overflow-wrap: anywhere; }.manual-peer small { color: var(--theme-text-secondary); font-size: var(--text-compact); overflow-wrap: anywhere; }button:hover { background: rgba(var(--theme-primary-rgb), .08); }.manual-edit-form, label { display: grid; gap: 8px; }.manual-edit-form { gap: 16px; }.manual-edit-form>div { display: flex; justify-content: end; gap: 8px; }select, textarea { color: var(--theme-text); background: var(--theme-bg); border: var(--theme-border); border-radius: var(--theme-radius-sm); padding: 8px; font: inherit; }[role=alert] { color: var(--status-danger); font-size: var(--text-sm); overflow-wrap: anywhere; }button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
</style>
