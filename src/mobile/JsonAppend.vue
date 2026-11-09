<template>
  <section v-if="opened" class="json-append json-operation-task" aria-label="JSON 新增内容" @pointerdown.capture="rememberInput" @keydown.capture="rememberInput" @focusin="rememberInput">
    <header class="json-append-header json-operation-header"><button class="json-append-back json-operation-icon" :aria-label="mode === 'review' ? '返回修改新增内容' : '返回结构操作'" @click="back"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1"><span>{{ mode === 'review' ? '核对' : isObject ? '新增' : '追加' }}</span><span>{{ mode === 'review' ? isObject ? '新增字段' : '追加项' : isObject ? '字段' : '数组项' }}</span></h1><MobileHelp topic="jsonAppend" /><button class="json-operation-icon" aria-label="取消新增" @click="close(true)"><X :size="22" aria-hidden="true" /></button></header>
    <div ref="body" class="json-append-body json-operation-body" @scroll="rememberBody">
      <JsonOperationContext class="json-append-context" :name="name" :location="location" label="新增内容位置" />
      <form v-if="mode === 'edit'" id="json-append-form" class="json-append-form json-operation-form" aria-label="新增 JSON 内容" @submit.prevent="prepare">
        <template v-if="isObject"><label for="json-append-name">字段名</label><input id="json-append-name" ref="nameInput" v-model="entry.name" :disabled="busy" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="nameError" :aria-describedby="error ? 'json-append-error' : undefined" autocomplete="off" autocapitalize="off" :spellcheck="false" @input="invalidate" @select="rememberInput" @scroll="rememberInput" /></template>
        <label for="json-append-kind">类型</label><select id="json-append-kind" ref="kindInput" v-model="entry.kind" :disabled="busy" @change="changeKind"><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option><option value="object">Object</option><option value="array">Array</option></select>
        <template v-if="entry.kind === 'boolean'"><label for="json-append-boolean">值</label><select id="json-append-boolean" ref="booleanInput" v-model="entry.values.boolean" :disabled="busy" @change="invalidate"><option value="true">true</option><option value="false">false</option></select></template>
        <template v-else-if="entry.kind === 'string' || entry.kind === 'number'"><label for="json-append-value">值</label><textarea v-if="entry.kind === 'string'" id="json-append-value" ref="valueInput" v-model="inputValue" data-kind="string" :disabled="busy" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="valueError" :aria-describedby="error ? 'json-append-error' : undefined" :spellcheck="false" @input="invalidate" @select="rememberInput" @scroll="rememberInput" /><input v-else id="json-append-value" ref="valueInput" v-model="inputValue" type="text" inputmode="decimal" data-kind="number" :disabled="busy" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :aria-invalid="valueError" :aria-describedby="error ? 'json-append-error' : undefined" autocomplete="off" autocapitalize="off" :spellcheck="false" @input="invalidate" @select="rememberInput" @scroll="rememberInput" /></template><template v-else><p class="json-operation-value-label">值</p><output class="json-operation-literal" aria-label="新增值">{{ entry.kind === 'null' ? 'null' : entry.kind === 'object' ? '{}' : '[]' }}</output></template>
        <p v-if="busy" role="status">正在核对新增内容…</p><p v-if="error" id="json-append-error" class="json-append-error json-operation-error" role="alert">{{ error }}</p>
      </form>
      <div v-else-if="proposal" class="json-operation-review" role="group" aria-label="核对新增内容"><section class="json-append-card json-operation-card"><h2 class="json-operation-card-heading"><SquarePlus :size="21" aria-hidden="true" />{{ isObject ? '新增字段' : `追加项 [${current?.children.length}]` }} · {{ jsonTypeName(entry.kind) }}</h2><JsonSourcePreview :value="snippet(preview)" :numbered="false" label="新增内容预览" /><p v-if="boundedJsonPreview(preview).truncated" class="json-operation-truncated">仅展示部分；应用使用完整内容。</p></section><button class="json-operation-secondary" @click="returnEdit">继续修改</button></div>
    </div>
    <footer class="json-append-footer json-operation-footer">
      <template v-if="mode === 'edit'"><button v-if="busy" class="button primary-button" @click="stopPreparation">停止核对</button><button v-else type="submit" form="json-append-form" class="button primary-button"><Check :size="21" aria-hidden="true" />核对新增项</button></template>
      <template v-else><button class="button primary-button" @click="apply"><Check :size="21" aria-hidden="true" />应用到草稿</button></template>
    </footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, X, Check, SquarePlus } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import JsonOperationContext from './JsonOperationContext.vue'
import JsonSourcePreview from './JsonSourcePreview.vue'
import {boundedJsonPreview} from './jsonPreview'
import {useJsonFieldVisibility} from './useJsonFieldVisibility'
import {jsonTypeName} from './jsonTree'
import { JSON_STRUCTURE_BUDGET, jsonScalarLiteral, type JsonField, type JsonValueKind, type JsonValuePatch } from './jsonStructure'
import { useJsonTask } from './useJsonTask'
const props = defineProps<{ content: string; identity: string; fields: JsonField[]; name: string; location: string; editing: boolean }>()
const emit = defineEmits<{ active: [value: boolean]; close: []; apply: [value: JsonValuePatch] }>()
type ValueKey = 'string' | 'number' | 'boolean'
type TextKey = 'name' | 'string' | 'number'
type Position = { start: number; end: number; left: number; top: number }
type Form = { name: string; kind: JsonValueKind; values: Record<ValueKey, string>; positions: Partial<Record<TextKey, Position>>; focus: TextKey | 'kind' | 'boolean'; scroll: number }
const fresh = (object: boolean): Form => ({ name: '', kind: 'string', values: { string: '', number: '', boolean: 'true' }, positions: {}, focus: object ? 'name' : 'kind', scroll: 0 })
const opened = ref(false), selected = ref(0), mode = ref<'edit' | 'review'>('edit'), entry = ref<Form>(fresh(true)), proposal = shallowRef<JsonValuePatch>(), preview = ref('')
const body = ref<HTMLElement>(), heading = ref<HTMLElement>(), nameInput = ref<HTMLInputElement>(), kindInput = ref<HTMLSelectElement>(), booleanInput = ref<HTMLSelectElement>(), valueInput = ref<HTMLInputElement|HTMLTextAreaElement>()
const pending = new Map<number, Form>()
let active = true
const current = computed(() => props.fields[selected.value]), isObject = computed(() => current.value?.kind === 'object'), valueKey = computed<ValueKey>(() => entry.value.kind === 'number' ? 'number' : entry.value.kind === 'boolean' ? 'boolean' : 'string')
const inputValue = computed({ get: () => entry.value.values[valueKey.value], set: (value: string) => { entry.value.values[valueKey.value] = value } })
const { busy, error, run, stop } = useJsonTask(() => ({ content: props.content, identity: props.identity + '\nappend:' + selected.value }))
useJsonFieldVisibility(body,()=>active&&opened.value&&mode.value==='edit',error)
const nameError = computed(() => /同名字段|字段名/.test(error.value)), valueError = computed(() => /JSON 数值|输入较长/.test(error.value))
const snippet = (value:string)=>boundedJsonPreview(value).text
function clone(form: Form): Form { const positions: Form['positions'] = {}; for (const key of ['name', 'string', 'number'] as const) if (form.positions[key]) positions[key] = { ...form.positions[key]! }; return { ...form, values: { ...form.values }, positions } }
function rememberInput() {
  if (mode.value !== 'edit') return
  const focused = document.activeElement
  const key: TextKey | undefined = focused === nameInput.value ? 'name' : focused === valueInput.value && (entry.value.kind === 'string' || entry.value.kind === 'number') ? entry.value.kind : undefined
  if (key) { const input = focused as HTMLInputElement | HTMLTextAreaElement; entry.value.positions[key] = { start: input.selectionStart || 0, end: input.selectionEnd || 0, left: input.scrollLeft, top: input.scrollTop }; entry.value.focus = key }
  else if (focused === kindInput.value) entry.value.focus = 'kind'
  else if (focused === booleanInput.value) entry.value.focus = 'boolean'
}
function rememberBody() { if (mode.value === 'edit') entry.value.scroll = body.value?.scrollTop || 0 }
function saveForm() { if (mode.value !== 'edit') return; rememberInput(); rememberBody(); pending.set(selected.value, clone(entry.value)) }
function restorePosition(input: HTMLInputElement | HTMLTextAreaElement | undefined, position: Position | undefined) { if (!input || !position) return; input.setSelectionRange(position.start, position.end); input.scrollLeft = position.left; input.scrollTop = position.top }
async function restoreInput() {
  await nextTick(); if (!active || !opened.value) return
  const saved = clone(entry.value), key = valueKey.value, textPosition = key === 'string' || key === 'number' ? saved.positions[key] : undefined
  restorePosition(nameInput.value, saved.positions.name); restorePosition(valueInput.value, textPosition)
  const target = saved.focus === 'name' ? nameInput.value : saved.focus === 'kind' ? kindInput.value : saved.focus === 'boolean' ? booleanInput.value : valueInput.value
  ;(target || kindInput.value)?.focus({ preventScroll: true })
  restorePosition(nameInput.value, saved.positions.name); restorePosition(valueInput.value, textPosition); if (body.value) body.value.scrollTop = saved.scroll; rememberInput()
}
function invalidate() { stop(); error.value = ''; proposal.value = undefined; preview.value = '' }
function changeKind() { invalidate(); entry.value.focus = 'kind'; void nextTick(() => { const key = valueKey.value; restorePosition(valueInput.value, key === 'string' || key === 'number' ? entry.value.positions[key] : undefined) }) }
async function open(id: number) { const field = props.fields[id]; if (!props.editing || !field || (field.kind !== 'object' && field.kind !== 'array')) return; invalidate(); selected.value = id; active = true; entry.value = clone(pending.get(id) || fresh(field.kind === 'object')); mode.value = 'edit'; opened.value = true; emit('active', true); await restoreInput() }
function close(discard = false) { saveForm(); if (discard) pending.delete(selected.value); invalidate(); opened.value = false; emit('active', false); emit('close') }
async function returnEdit() { proposal.value = undefined; preview.value = ''; mode.value = 'edit'; await restoreInput() }
async function stopPreparation() { invalidate(); await restoreInput() }
function prepare() {
  if (!opened.value || !props.editing || busy.value) return
  saveForm(); invalidate(); const form = clone(entry.value), object = isObject.value
  const input = form.kind === 'string' || form.kind === 'number' || form.kind === 'boolean' ? form.values[form.kind] : ''
  run({ id: selected.value, operation: { action: 'append', name: form.name, kind: form.kind, input } }, value => { if (!active || !opened.value || !value.patch) return; const literal = form.kind === 'object' ? '{}' : form.kind === 'array' ? '[]' : jsonScalarLiteral(form.kind, input); preview.value = object ? JSON.stringify(form.name) + ': ' + literal : literal; proposal.value = value.patch; mode.value = 'review'; if (body.value) body.value.scrollTop = 0; void nextTick(() => heading.value?.focus({ preventScroll: true })) })
}
function apply() { if (!props.editing || !proposal.value || proposal.value.source !== props.content) return; emit('apply', proposal.value) }
function back() { if (!opened.value) return false; if (mode.value === 'review') void returnEdit(); else close(); return true }
function suspend() { saveForm(); stop(); active = false }
function resume() { active = true; if (!opened.value) return; if (mode.value === 'edit') void restoreInput(); else void nextTick(() => heading.value?.focus({ preventScroll: true })) }
function reset() { invalidate(); pending.clear(); opened.value = false; emit('active', false) }
watch(() => [props.content, props.identity], reset, { flush: 'sync' })
watch(() => props.editing, value => { if (!value) reset() })
defineExpose({ open, back, suspend, resume })
</script>
