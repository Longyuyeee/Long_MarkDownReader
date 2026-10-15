<template>
  <n-modal :show="true" preset="card" title="笔记模板" class="note-template-dialog" :style="{ width: 'min(840px, 94vw)' }" :mask-closable="false" :closable="!busy" :close-on-esc="!busy" @esc="close" @close="close">
    <div class="template-default"><label for="default-note-template">此资料库新建笔记时使用</label><select id="default-note-template" :value="store.defaultNoteTemplates[libraryRoot] || BLANK_NOTE_TEMPLATE" :disabled="busy" @change="changeDefault"><option v-for="item in store.allNoteTemplates" :key="item.id" :value="item.id">{{ item.name }}</option></select></div>
    <div class="template-workspace">
      <nav aria-label="模板列表"><n-button block secondary :disabled="busy" @click="chooseNew"><template #icon><Plus :size="16" /></template>新建模板</n-button><div class="template-list"><button v-for="item in store.allNoteTemplates" :key="item.id" type="button" :class="{ selected: selectedId === item.id }" :aria-pressed="selectedId === item.id" :disabled="busy" @click="choose(item)"><FileText :size="16" /><span>{{ item.name }}</span><small v-if="item.id.startsWith('builtin:')">内置</small></button></div></nav>
      <section class="template-editor" aria-label="编辑模板">
        <label>模板名称<input v-model="name" aria-label="模板名称" maxlength="80" :disabled="busy || builtin" placeholder="例如：客户沟通记录" /></label>
        <div class="template-edit-heading"><span>{{ builtin ? '内置模板 · 可另存一份再修改' : '模板正文' }}</span><n-button size="tiny" quaternary :aria-pressed="preview" @click="preview = !preview">{{ preview ? '返回编辑' : '预览填充效果' }}</n-button></div>
        <pre v-if="preview" class="template-preview" aria-label="模板预览">{{ rendered || '空白笔记' }}</pre>
        <textarea v-else ref="bodyInput" v-model="content" aria-label="模板正文" :disabled="busy" :readonly="builtin" placeholder="写下每次都要用的结构…" />
        <div class="template-variables"><span>插入变量</span><button v-for="variable in variables" :key="variable.key" type="button" :disabled="busy || builtin || preview" @click="insertVariable(variable.key)">{{ variable.label }}</button></div>
      </section>
    </div>
    <p v-if="error" class="template-error" role="alert">{{ error }}</p>
    <template #footer><div class="template-actions"><n-button v-if="!builtin && selectedId !== 'new'" quaternary type="error" :disabled="busy" @click="remove">删除模板</n-button><span /><n-button :disabled="busy" @click="close">关闭</n-button><n-button v-if="builtin" type="primary" :disabled="busy" @click="copyBuiltin">另存为自定义模板</n-button><n-button v-else type="primary" :loading="busy" :disabled="busy || !dirty" @click="save">保存模板</n-button></div></template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NModal, NButton, useDialog, useMessage } from 'naive-ui'
import { FileText, Plus } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
import { BLANK_NOTE_TEMPLATE, renderNoteTemplate, type NoteTemplate } from '../config/noteTemplates'
import { confirmAppAction } from '../services/appDialog'
import { beginWindowSave, useWindowDraft, recordWindowDraftActivity } from '../services/windowDrafts'

const props = defineProps<{ libraryRoot: string; initialNote?: { name: string; content: string } }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore(), dialog = useDialog(), message = useMessage()
const selectedId = ref(props.initialNote ? 'new' : BLANK_NOTE_TEMPLATE)
const name = ref(props.initialNote?.name || ''), content = ref(props.initialNote?.content || '')
const original = ref(props.initialNote ? '' : JSON.stringify({ name: '', content: '' }))
const busy = ref(false), error = ref(''), preview = ref(false), bodyInput = ref<HTMLTextAreaElement>()
const builtin = computed(() => selectedId.value.startsWith('builtin:'))
const dirty = computed(() => !builtin.value && JSON.stringify({ name: name.value, content: content.value }) !== original.value)
useWindowDraft(() => dirty.value)
watch([name, content], recordWindowDraftActivity, { flush: 'sync' })
const rendered = computed(() => renderNoteTemplate(content.value, name.value.trim() || '新笔记'))
const variables = [{ key: 'title', label: '标题' }, { key: 'date', label: '日期' }, { key: 'time', label: '时间' }]
const allowDiscard = async () => !dirty.value || await confirmAppAction(dialog, { title: '放弃模板修改？', content: '尚未保存的模板修改将丢弃。', positiveText: '放弃修改', negativeText: '继续编辑' })
const load = (item?: NoteTemplate) => {
  selectedId.value = item?.id || 'new'; name.value = item?.name || ''; content.value = item?.content || ''
  original.value = JSON.stringify({ name: name.value, content: content.value }); error.value = ''; preview.value = false
}
const choose = async (item: NoteTemplate) => { if (!busy.value && selectedId.value !== item.id && await allowDiscard()) load(item) }
const chooseNew = async () => { if (!busy.value && await allowDiscard()) load() }
const close = async () => { if (!busy.value && await allowDiscard()) emit('close') }
const copyBuiltin = () => { selectedId.value = 'new'; name.value += ' - 自定义'; original.value = ''; preview.value = false }
const insertVariable = async (key: string) => {
  const input = bodyInput.value, start = input?.selectionStart ?? content.value.length, end = input?.selectionEnd ?? start
  const variable = '{{' + key + '}}'
  content.value = content.value.slice(0, start) + variable + content.value.slice(end)
  await nextTick(); input?.focus(); input?.setSelectionRange(start + variable.length, start + variable.length)
}
const save = async () => {
  if (busy.value || builtin.value) return
  busy.value = true; error.value = ''; const endSave = beginWindowSave()
  try {
    const entry = { id: selectedId.value === 'new' ? crypto.randomUUID() : selectedId.value, name: name.value, content: content.value }
    await store.saveNoteTemplate(entry); load({ ...entry, name: entry.name.trim() }); message.success('模板已保存，可在“新建”和快速笔记中使用')
  } catch (cause) { error.value = String(cause) }
  finally { busy.value = false; endSave() }
}
const remove = async () => {
  if (!await confirmAppAction(dialog, { title: '删除模板「' + name.value + '」？', content: '已创建的笔记会保留。使用此模板的资料库将改为新建空白笔记。', positiveText: '删除模板', danger: true })) return
  busy.value = true; error.value = ''; const endSave = beginWindowSave()
  try { await store.deleteNoteTemplate(selectedId.value); load(); message.success('模板已删除') }
  catch (cause) { error.value = String(cause) }
  finally { busy.value = false; endSave() }
}
const changeDefault = async (event: Event) => {
  const input = event.target as HTMLSelectElement, id = input.value
  input.value = store.defaultNoteTemplates[props.libraryRoot] || BLANK_NOTE_TEMPLATE
  busy.value = true; error.value = ''; const endSave = beginWindowSave()
  try { await store.setDefaultNoteTemplate(props.libraryRoot, id); message.success('默认模板已更新') }
  catch (cause) { error.value = String(cause) }
  finally { busy.value = false; endSave() }
}
if (!props.initialNote) load(store.allNoteTemplates[0])
</script>

<style scoped>
.template-default { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding-bottom: 16px; color: var(--theme-text-secondary); }
select, input, textarea { font: inherit; color: var(--theme-text); background: var(--theme-bg); border: 1px solid var(--theme-border-color, #8885); border-radius: var(--theme-radius-sm); padding: 8px 10px; box-sizing: border-box; }
.template-default select { flex: 1; min-width: 120px; max-width: 300px; }
.template-workspace { display: grid; grid-template-columns: 185px minmax(0, 1fr); gap: 20px; }
nav { min-width: 0; }.template-list { max-height: 43vh; overflow: auto; margin-top: 8px; }
.template-list button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 8px; border: 0; border-radius: var(--theme-radius-sm); color: var(--theme-text); background: transparent; text-align: left; cursor: pointer; font: inherit; }
.template-list button span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.template-list small { color: var(--theme-text-secondary); font-size: var(--text-xs); }
.template-list button.selected { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .12); }.template-list button:hover { background: rgba(var(--theme-primary-rgb), .07); }
.template-editor { display: flex; flex-direction: column; gap: 10px; min-width: 0; }.template-editor>label { display: flex; flex-direction: column; gap: 6px; }.template-editor input { width: 100%; }
.template-edit-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; font-size: var(--text-sm); color: var(--theme-text-secondary); }
textarea, .template-preview { width: 100%; height: min(320px, 38vh); min-height: 120px; resize: vertical; overflow: auto; line-height: 1.7; font-family: var(--font-mono, monospace); }
.template-preview { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--theme-border-color, #8885); border-radius: var(--theme-radius-sm); padding: 8px 10px; box-sizing: border-box; background: var(--theme-bg); }
.template-variables { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; color: var(--theme-text-secondary); font-size: var(--text-sm); }.template-variables button { cursor: pointer; font: inherit; color: var(--theme-primary); background: transparent; border: 1px solid var(--theme-border-color, #8885); border-radius: var(--theme-radius-sm); padding: 3px 10px; }
.template-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }.template-actions>span { flex: 1; }.template-error { color: var(--theme-error, #d45959); overflow-wrap: anywhere; margin-bottom: 0; }
button:disabled { cursor: default; opacity: .5; }input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
@media (max-width: 600px) { .template-workspace { grid-template-columns: 1fr; gap: 12px; }.template-list { display: flex; gap: 4px; max-height: 90px; flex-wrap: wrap; }.template-list button { width: auto; max-width: 170px; padding: 5px; }textarea, .template-preview { height: 25vh; }.template-actions { gap: 5px; } }
</style>
