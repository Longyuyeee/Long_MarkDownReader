<template>
  <section v-if="opened" class="json-rename json-operation-task" aria-label="JSON 字段重命名" @pointerdown.capture="rememberInput" @keydown.capture="rememberInput">
    <header class="json-rename-header json-operation-header"><button class="json-rename-back json-operation-icon" :aria-label="mode === 'review' ? '返回修改名称' : '返回结构操作'" @click="back"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1"><span>{{ mode === 'review' ? '核对' : '重命名' }}</span><span>{{ mode === 'review' ? '重命名' : '字段' }}</span></h1><MobileHelp topic="jsonRename" /><button class="json-operation-icon" aria-label="取消重命名" @click="close(true)"><X :size="22" aria-hidden="true" /></button></header>
    <div ref="body" class="json-rename-body json-operation-body">
      <JsonOperationContext class="json-rename-context" :name="name" :location="location" label="重命名字段位置" />
      <form v-if="mode === 'edit'" id="json-rename-form" class="json-rename-form json-operation-form" aria-label="重命名 JSON 字段" @submit.prevent="prepare">
        <label for="json-rename-name">字段名</label><input id="json-rename-name" ref="nameInput" v-model="candidate" :maxlength="JSON_STRUCTURE_BUDGET.valueCharacters" :disabled="busy" :aria-invalid="!!error" :aria-describedby="error ? 'json-rename-error' : undefined" autocomplete="off" autocapitalize="off" :spellcheck="false" @input="invalidate" @select="rememberInput" @scroll="rememberInput" />
        <p v-if="busy" role="status">正在核对重命名…</p><p v-if="error" id="json-rename-error" class="json-rename-error json-operation-error" role="alert">{{ error }}</p>
      </form>
      <div v-else-if="proposal" class="json-operation-review" role="group" aria-label="核对字段重命名">
        <section class="json-rename-card json-operation-card"><h2>原字段名</h2><JsonSourcePreview :value="snippet(content.slice(proposal.from,proposal.to))" :numbered="false" label="重命名前的字段名" /><p v-if="boundedJsonPreview(content.slice(proposal.from,proposal.to)).truncated" class="json-operation-truncated">仅展示部分；应用使用完整名称。</p></section>
        <section class="json-rename-card json-operation-card json-operation-candidate"><h2>新字段名</h2><JsonSourcePreview :value="snippet(proposal.text)" :numbered="false" label="重命名后的字段名" /><p v-if="boundedJsonPreview(proposal.text).truncated" class="json-operation-truncated">仅展示部分；应用使用完整名称。</p></section>
        <p v-if="unchanged" role="status">字段名无需修改。</p><button class="json-operation-secondary" @click="returnEdit">继续修改</button>
      </div>
    </div>
    <footer class="json-rename-footer json-operation-footer">
      <template v-if="mode === 'edit'"><button v-if="busy" type="button" class="button primary-button" @click="stopPreparation">停止核对</button><button v-else type="submit" form="json-rename-form" class="button primary-button"><Check :size="21" aria-hidden="true" />核对重命名</button></template>
      <template v-else><button class="button primary-button" :disabled="unchanged" @click="apply"><Check :size="21" aria-hidden="true" />应用到草稿</button></template>
    </footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, X, Check } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import JsonOperationContext from './JsonOperationContext.vue'
import JsonSourcePreview from './JsonSourcePreview.vue'
import {boundedJsonPreview} from './jsonPreview'
import {useJsonFieldVisibility} from './useJsonFieldVisibility'
import { JSON_STRUCTURE_BUDGET, type JsonField, type JsonValuePatch } from './jsonStructure'
import { useJsonTask } from './useJsonTask'
const props = defineProps<{ content: string; identity: string; fields: JsonField[]; name: string; location: string; editing: boolean }>()
const emit = defineEmits<{ active: [value: boolean]; close: []; apply: [value: JsonValuePatch] }>()
const opened = ref(false), selected = ref(0), mode = ref<'edit' | 'review'>('edit'), candidate = ref(''), proposal = shallowRef<JsonValuePatch>(), nameInput = ref<HTMLInputElement>(), heading = ref<HTMLElement>(), body = ref<HTMLElement>()
type Form = { name: string; start: number; end: number; left: number; scroll: number }
const pending = new Map<number, Form>()
let position: Form | undefined, active = true
const { busy, error, run, stop } = useJsonTask(() => ({ content: props.content, identity: props.identity + '\nrename:' + selected.value }))
useJsonFieldVisibility(body,()=>active&&opened.value&&mode.value==='edit',error)
const unchanged = computed(() => !!proposal.value && proposal.value.text === props.content.slice(proposal.value.from, proposal.value.to))
const snippet = (value:string)=>boundedJsonPreview(value).text
function rememberInput() { const input = nameInput.value; if (mode.value !== 'edit' || !input || document.activeElement !== input) return; position = { name: candidate.value, start: input.selectionStart || 0, end: input.selectionEnd || 0, left: input.scrollLeft, scroll: body.value?.scrollTop || 0 } }
function saveForm() { if (mode.value !== 'edit') return; rememberInput(); const input = nameInput.value; position = { name: candidate.value, start: input?.selectionStart ?? position?.start ?? 0, end: input?.selectionEnd ?? position?.end ?? 0, left: position?.left || 0, scroll: body.value?.scrollTop || 0 }; pending.set(selected.value, position) }
async function restoreInput() { await nextTick(); if (!active || !opened.value) return; const input = nameInput.value, saved = position; input?.focus({ preventScroll: true }); input?.setSelectionRange(saved?.start || 0, saved?.end || 0); if (input) input.scrollLeft = saved?.left || 0; if (body.value) body.value.scrollTop = saved?.scroll || 0 }
function invalidate() { stop(); error.value = ''; proposal.value = undefined }
async function open(id: number) {
  const field = props.fields[id]; if (!props.editing || !field || field.keyFrom === undefined || props.fields[field.parent!]?.kind !== 'object') return
  invalidate(); selected.value = id; active = true; position = pending.get(id) || { name: field.label, start: 0, end: field.label.length, left: 0, scroll: 0 }; candidate.value = position.name; mode.value = 'edit'; opened.value = true; emit('active', true); await restoreInput()
}
async function close(discard = false) { saveForm(); if (discard) pending.delete(selected.value); invalidate(); opened.value = false; emit('active', false); emit('close') }
async function returnEdit() { proposal.value = undefined; mode.value = 'edit'; await restoreInput() }
async function stopPreparation() { invalidate(); await restoreInput() }
function prepare() {
  if (!opened.value || !props.editing || busy.value) return
  saveForm(); invalidate()
  run({ id: selected.value, operation: { action: 'rename', name: candidate.value } }, value => { if (!active || !opened.value || !value.patch) return; proposal.value = value.patch; mode.value = 'review'; if (body.value) body.value.scrollTop = 0; void nextTick(() => heading.value?.focus({ preventScroll: true })) })
}
function apply() { if (!props.editing || !proposal.value || unchanged.value || proposal.value.source !== props.content) return; emit('apply', proposal.value) }
function back() { if (!opened.value) return false; if (mode.value === 'review') void returnEdit(); else void close(); return true }
function suspend() { saveForm(); stop(); active = false }
function resume() { active = true; if (!opened.value) return; if (mode.value === 'edit') void restoreInput(); else void nextTick(() => heading.value?.focus({ preventScroll: true })) }
function reset() { invalidate(); pending.clear(); opened.value = false; emit('active', false) }
watch(() => [props.content, props.identity], reset, { flush: 'sync' })
watch(() => props.editing, value => { if (!value) reset() })
defineExpose({ open, back, suspend, resume })
</script>
