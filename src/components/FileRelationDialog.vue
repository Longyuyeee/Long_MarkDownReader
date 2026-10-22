<template>
  <n-modal :show="visible" preset="card" title="添加资料关系" class="file-relation-dialog" :style="{ width: 'min(540px, calc(100vw - 28px))' }" :mask-closable="!saving" :closable="!saving" :close-on-esc="!saving" @update:show="show => { if (!saving) visible = show }">
    <template #header><span class="dialog-title"><Network />添加资料关系</span></template>
    <div v-if="!root" class="no-library"><p>先选择一个资料库，就可以关联其中的文件。</p><button @click="visible = false; router.push({ name: 'Settings', query: { category: 'library' } })">选择资料库</button></div>
    <form v-else class="relation-dialog-body" @submit.prevent="save">
      <WorkspaceHelp label="说明：关联当前资料库里的文件，笔记、PDF" text="关联当前资料库里的文件，笔记、PDF、表格、图片等都可以。" />
      <div class="file-pair"><label><span><FileText />从这份文件</span><RelationFilePicker v-model:value="source" :library-root="root" label="关系起点" :disabled="saving" /></label><span class="pair-arrow"><ArrowRight v-if="kind.directed" /><ArrowLeftRight v-else /></span><label><span><Files />关联到</span><RelationFilePicker v-model:value="target" :library-root="root" label="关系目标文件" :exclude="source" :disabled="saving" /></label></div>
      <label>它们是什么关系？<select v-model="relationType" :disabled="saving" aria-label="资料关系类型"><option v-for="type in fileRelationTypes" :key="type.value" :value="type.value">{{ type.label }}</option></select><small>{{ kind.description }}</small></label>
      <div v-if="source && target" class="relation-preview"><span>{{ filename(source) }}</span><ArrowRight v-if="kind.directed" /><ArrowLeftRight v-else /><span>{{ filename(target) }}</span><b>{{ kind.label }}</b></div>
      <label>补充说明（可不填）<textarea v-model="note" :disabled="saving" maxlength="2000" rows="2" placeholder="例如：这份表格是项目方案的数据依据" /></label>
      <WorkspaceHelp label="说明：保存后立即出现在图谱中，原文件内容保" text="保存后立即出现在图谱中，原文件内容保持不变。" />
      <div v-if="error" class="dialog-error" role="alert"><p>{{ error }}</p><details v-if="errorDetails"><summary>错误详情</summary><pre>{{ errorDetails }}</pre></details></div>
      <p v-if="notice" class="dialog-notice" role="status"><Check />{{ notice }}</p>
      <div class="dialog-actions"><button type="button" :disabled="saving" @click="visible = false">完成</button><button class="primary" type="submit" :disabled="saving || !source || !target || sameWorkspacePath(source, target)"><Plus />{{ saving ? '正在保存…' : '添加关系' }}</button></div>
      <details v-if="source" class="existing-relations"><summary>这份文件已有的手动关系 <small>{{ existing.length }}</small></summary><p v-if="existingLoading">正在读取关系…</p><div v-else-if="existingError" role="alert"><p>暂时没能读取已有关系。</p><button type="button" @click="loadExisting">重试</button></div><p v-else-if="!existing.length">还没有手动关系，可以从上面添加。</p><article v-for="entry in existing" :key="entry.id"><div><strong>{{ filename(sameWorkspacePath(entry.sourcePath, source) ? entry.targetPath : entry.sourcePath) }}</strong><small>{{ relationLabel(entry.relationType) }} · {{ entry.relationType === 'related' ? '相互关联' : sameWorkspacePath(entry.sourcePath, source) ? '从当前文件出发' : '指向当前文件' }}</small><p v-if="entry.note">{{ entry.note }}</p></div><button type="button" :disabled="saving" :aria-label="`移除与 ${filename(sameWorkspacePath(entry.sourcePath, source) ? entry.targetPath : entry.sourcePath)} 的关系`" @click="remove(entry)"><Unlink /></button></article></details>
    </form>
  </n-modal>
</template>
<script setup lang="ts">
import WorkspaceHelp from './workspace/WorkspaceHelp.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NModal } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { ArrowLeftRight, ArrowRight, Check, FileText, Files, Network, Plus, Unlink } from 'lucide-vue-next'
import RelationFilePicker from './RelationFilePicker.vue'
import { useAppStore } from '../store/app'
import { announceFileRelationsChanged, fileRelationTypes, type FileRelation } from '../services/fileRelations'
import { sameWorkspacePath } from '../utils/savedCollections'
import { searchResultPath } from '../utils/searchResultPath'
const store = useAppStore(), router = useRouter()
const visible = ref(false), root = ref(''), source = ref(''), target = ref(''), relationType = ref('related'), note = ref('')
const saving = ref(false), error = ref(''), errorDetails = ref(''), notice = ref(''), existingLoading = ref(false), existingError = ref('')
const existing = ref<FileRelation[]>([])
const kind = computed(() => fileRelationTypes.find(type => type.value === relationType.value) || fileRelationTypes[0])
const filename = (path: string) => path.split(/[\\/]/).pop() || path
const relationLabel = (type: string) => fileRelationTypes.find(entry => entry.value === type)?.label || type
let generation = 0, listGeneration = 0, disposed = false
const open = (event: Event) => {
  if (saving.value) return
  ++generation; root.value = store.libraryPath; source.value = ''; target.value = ''; relationType.value = 'related'; note.value = ''; error.value = ''; errorDetails.value = ''; notice.value = ''; existing.value = []
  const path = (event as CustomEvent<{ sourcePath?: string }>).detail?.sourcePath || store.activeTabId || ''
  const relative = searchResultPath(path, root.value)
  if (root.value && path && !/^(?:[a-z]:|\/)/i.test(relative)) source.value = path
  visible.value = true
}
async function loadExisting() {
  const token = ++listGeneration, libraryRoot = root.value, path = source.value
  existing.value = []; existingError.value = ''; existingLoading.value = Boolean(path)
  if (!path || !visible.value) return
  try { const entries = await invoke<FileRelation[]>('list_file_relations', { libraryRoot, path }); if (!disposed && token === listGeneration && root.value === libraryRoot && source.value === path) existing.value = entries }
  catch (cause) { if (!disposed && token === listGeneration) existingError.value = String(cause) }
  finally { if (token === listGeneration) existingLoading.value = false }
}
async function save() {
  if (saving.value || !source.value || !target.value) return
  const token = generation, libraryRoot = root.value
  saving.value = true; error.value = ''; errorDetails.value = ''; notice.value = ''
  try {
    await invoke<FileRelation>('save_file_relation', { libraryRoot, sourcePath: source.value, targetPath: target.value, relationType: relationType.value, note: note.value })
    announceFileRelationsChanged(libraryRoot)
    if (disposed || token !== generation) return
    notice.value = '关系已保存，可以继续添加或返回阅读。'; await loadExisting()
  } catch (cause) { if (!disposed && token === generation) { error.value = '关系没有保存成功，所选文件和说明已保留，请重试。'; errorDetails.value = String(cause) } }
  finally { saving.value = false }
}
async function remove(entry: FileRelation) {
  if (saving.value) return
  const libraryRoot = root.value, token = generation
  saving.value = true; error.value = ''; errorDetails.value = ''; notice.value = ''
  try { await invoke('remove_file_relation', { libraryRoot, relationId: entry.id }); announceFileRelationsChanged(libraryRoot); if (!disposed && token === generation) { notice.value = '关系已移除，文件仍保留。'; await loadExisting() } }
  catch (cause) { if (!disposed && token === generation) { error.value = '关系暂未移除，请重试。'; errorDetails.value = String(cause) } }
  finally { saving.value = false }
}
watch([source, visible], () => { if (target.value && sameWorkspacePath(source.value, target.value)) target.value = ''; error.value = ''; notice.value = ''; void loadExisting() })
watch(() => store.libraryPath, () => { ++generation; ++listGeneration; visible.value = false })
onMounted(() => window.addEventListener('longedit:add-file-relation', open))
onBeforeUnmount(() => { disposed = true; ++generation; ++listGeneration; window.removeEventListener('longedit:add-file-relation', open) })
</script>
<style scoped>
.dialog-title { display: flex; align-items: center; gap: 8px; }.dialog-title svg { width: 20px; color: var(--theme-primary); }.relation-dialog-body { display: grid; gap: 16px; max-height: calc(100vh - 160px); overflow-y: auto; padding: 1px 3px; color: var(--theme-text); font-size: var(--text-sm); }.dialog-intro { margin: 0; color: var(--theme-text-secondary); line-height: 1.6; font-size: var(--text-compact); }.file-pair { display: grid; grid-template-columns: 1fr; gap: 8px; padding: 12px; background: var(--theme-surface); border: var(--theme-border); border-radius: var(--theme-radius-sm); }.file-pair label > span { display: flex; align-items: center; gap: 6px; }.file-pair svg { width: 15px; height: 15px; color: var(--theme-primary); }.pair-arrow { justify-self: center; }.pair-arrow svg { transform: rotate(90deg); }label { display: grid; gap: 7px; min-width: 0; font-size: var(--text-compact); }label small { color: var(--theme-text-secondary); line-height: 1.5; }select, textarea, button { font: inherit; color: var(--theme-text); background: var(--theme-surface); border: 1px solid var(--workspace-border-color); border-radius: var(--theme-radius-sm); box-sizing: border-box; min-width: 0; }select, textarea { width: 100%; padding: 8px; }textarea { resize: vertical; }.relation-preview { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; padding: 10px; border-radius: var(--theme-radius-sm); background: rgba(var(--theme-primary-rgb), .07); color: var(--theme-primary); font-size: var(--text-compact); }.relation-preview span { overflow-wrap: anywhere; }.relation-preview b { font-size: var(--text-compact); font-weight: 500; }.relation-preview svg { width: 16px; height: 16px; }.save-explanation { margin: 0; font-size: 11px; color: var(--theme-text-secondary); line-height: 1.5; }.dialog-actions { display: flex; justify-content: end; gap: 8px; }button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 10px; cursor: pointer; }button svg { width: 16px; height: 16px; }button:hover { background: rgba(var(--theme-primary-rgb), .08); }button:disabled { opacity: .5; cursor: default; }.primary { background: var(--theme-primary); border-color: transparent; color: var(--workspace-on-accent, var(--theme-bg)); font-weight: 600; }.primary:hover { background: color-mix(in srgb, var(--theme-primary) 88%, var(--theme-text)); }select:focus, textarea:focus, button:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }.dialog-error { padding: 10px; border: var(--theme-border); border-radius: var(--theme-radius-sm); font-size: var(--text-compact); }.dialog-error p { margin: 0; }.dialog-error details { margin-top: 8px; color: var(--theme-text-secondary); font-size: 11px; }pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }.dialog-notice { margin: 0; display: flex; align-items: start; gap: 6px; color: var(--theme-primary); font-size: var(--text-compact); }.dialog-notice svg { width: 16px; height: 16px; }.existing-relations { border-top: var(--theme-border); padding-top: 12px; color: var(--theme-text-secondary); font-size: var(--text-compact); }.existing-relations summary { cursor: pointer; }.existing-relations summary small { color: var(--theme-primary); margin-left: 6px; }.existing-relations article { display: flex; align-items: center; gap: 8px; border-bottom: var(--theme-border); padding: 10px 0; }.existing-relations article > div { display: grid; gap: 5px; flex: 1; min-width: 0; }.existing-relations strong, .existing-relations p { overflow-wrap: anywhere; }.existing-relations p { margin: 0; line-height: 1.5; }.existing-relations strong { color: var(--theme-text); }.existing-relations small { font-size: var(--text-compact); }.existing-relations article > button { border: 0; padding: 5px; background: transparent; }.no-library { line-height: 1.6; }:global(.file-relation-dialog.n-card) { border-radius: var(--theme-radius); }
</style>
