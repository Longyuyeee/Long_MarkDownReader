<template>
  <n-modal :show="true" preset="card" title="导入笔记模板" class="note-template-import-dialog" :style="{ width: 'min(800px, 94vw)' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @close="!busy && $emit('close')" @update:show="value => { if (!value && !busy) $emit('close') }">
    <div class="import-tools"><span>{{ entries.length }} 个模板 · 已选 {{ selected.length }} 个</span><label>遇到同名<select v-model="conflict" :disabled="busy"><option value="keep-both">保留两份，自动改名</option><option value="skip">跳过同名模板</option></select></label></div>
    <div class="import-workspace">
      <div class="import-list"><label class="select-all"><input type="checkbox" :checked="selected.length === entries.length" :disabled="busy" @change="selected = ($event.target as HTMLInputElement).checked ? entries.map((_, index) => index) : []" />全选</label><div v-for="(entry, index) in entries" :key="index" :class="{ active: previewIndex === index }"><input v-model="selected" type="checkbox" :value="index" :aria-label="'导入 ' + entry.name" :disabled="busy" /><button :disabled="busy" @click="previewIndex = index"><strong>{{ entry.name }}</strong><small v-if="status(index)?.skipped">将跳过</small><small v-else-if="status(index)?.renamed">导入为 {{ status(index)?.name }}</small></button></div></div>
      <section aria-label="待导入模板预览"><strong>{{ entries[previewIndex]?.name }}</strong><pre>{{ entries[previewIndex]?.content || '空白笔记' }}</pre></section>
    </div>
    <p v-if="error || capacityError" role="alert">{{ error || capacityError }}</p>
    <template #footer><div class="import-actions"><span>将添加 {{ addedCount }} 个{{ skippedCount ? `，跳过 ${skippedCount} 个` : '' }}</span><n-button :disabled="busy" @click="$emit('close')">取消</n-button><n-button type="primary" :loading="busy" :disabled="busy || !addedCount || Boolean(capacityError)" @click="apply">导入所选模板</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { NModal, NButton } from 'naive-ui'
import { useAppStore } from '../store/app'
import { MAX_NOTE_TEMPLATES, type NoteTemplate } from '../config/noteTemplates'
import { planTemplateImport, type PortableNoteTemplate, type TemplateConflictMode } from '../utils/noteTemplateTransfer'
import { beginWindowSave } from '../services/windowDrafts'
const props = defineProps<{ entries: PortableNoteTemplate[] }>()
const emit = defineEmits<{ close: []; imported: [added: NoteTemplate[], skipped: number] }>()
const store = useAppStore(), selected = ref(props.entries.map((_, index) => index)), conflict = ref<TemplateConflictMode>('keep-both'), previewIndex = ref(0), busy = ref(false), error = ref('')
const plan = computed(() => planTemplateImport(props.entries, selected.value, store.noteTemplates, conflict.value))
const addedCount = computed(() => plan.value.filter(item => !item.skipped).length)
const skippedCount = computed(() => plan.value.length - addedCount.value)
const capacityError = computed(() => store.noteTemplates.length + addedCount.value > MAX_NOTE_TEMPLATES ? `本机还可添加 ${MAX_NOTE_TEMPLATES - store.noteTemplates.length} 个模板，请减少勾选` : '')
const status = (index: number) => plan.value.find(item => item.sourceIndex === index)
async function apply() {
  if (busy.value || !addedCount.value || capacityError.value) return
  busy.value = true; error.value = ''; const finish = beginWindowSave()
  try { const result = await store.importNoteTemplates(props.entries, selected.value, conflict.value); emit('imported', result.added, result.skipped) }
  catch (cause) { error.value = '导入未完成，选择已保留：' + String(cause) }
  finally { busy.value = false; finish() }
}
</script>
<style scoped>
.import-tools, .import-tools label, .import-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }.import-tools { justify-content: space-between; margin-bottom: 14px; color: var(--theme-text-secondary); }.import-workspace { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 1.3fr); gap: 16px; }.import-list { max-height: 42vh; overflow: auto; }.import-list>div { display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: var(--theme-radius-sm); }.import-list>div.active { background: rgba(var(--theme-primary-rgb), .1); }.import-list button { display: grid; gap: 4px; flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; color: var(--theme-text); padding: 7px; font: inherit; cursor: pointer; }.import-list strong, .import-list small { overflow-wrap: anywhere; }.import-list small { color: var(--theme-text-secondary); }.select-all { display: flex; align-items: center; gap: 8px; padding: 8px 4px; }input { accent-color: var(--theme-primary); }select { padding: 6px; font: inherit; color: var(--theme-text); background: var(--theme-bg); border: var(--theme-border); border-radius: var(--theme-radius-sm); }section { min-width: 0; }section>strong { overflow-wrap: anywhere; }pre { height: 35vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--theme-bg); color: var(--theme-text); border: var(--theme-border); border-radius: var(--theme-radius-sm); padding: 10px; font-family: var(--font-mono, monospace); }.import-actions>span { flex: 1; color: var(--theme-text-secondary); }[role=alert] { color: var(--status-danger); }button:focus-visible, select:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }@media(max-width:600px) { .import-workspace { grid-template-columns: 1fr; }.import-list { max-height: 23vh; }pre { height: 18vh; } }
</style>
