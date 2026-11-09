<template>
  <section v-if="opened" class="json-remove json-operation-task" aria-label="JSON 移除内容">
    <header class="json-remove-header json-operation-header"><button class="json-remove-back json-operation-icon" aria-label="返回结构操作" @click="back"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">移除此项</h1><MobileHelp topic="jsonRemove" /></header>
    <div ref="body" class="json-remove-body json-operation-body" @scroll="rememberScroll">
      <JsonOperationContext class="json-remove-context" :name="name" :location="location" label="移除内容位置" />
      <p v-if="descendants" class="json-remove-impact json-operation-impact"><Trash2 :size="21" aria-hidden="true" />同时移除内部 {{ descendants }} 项内容</p>
      <section class="json-remove-card json-operation-card"><h2 class="json-operation-card-heading"><component :is="current?.kind === 'object' ? Box : current?.kind === 'array' ? Layers : FileText" :size="21" aria-hidden="true" />将移除 · {{ current && jsonTypeName(current.kind) }}</h2><JsonSourcePreview :value="preview" :numbered="false" label="待移除内容" /><p v-if="truncated" class="json-remove-truncated json-operation-truncated">仅展示部分；将移除完整内容。</p></section>
      <p v-if="busy" role="status">正在核对移除范围…</p><p v-if="stopped" role="status">核对已停止。</p><p v-if="error" class="json-remove-error json-operation-error" role="alert">{{ error }}</p>
      <button v-if="!busy && !proposal" class="button json-remove-retry" @click="prepare">重新核对</button>
    <button class="json-operation-secondary" @click="close">取消移除</button></div>
    <footer class="json-remove-footer json-operation-footer"><button v-if="busy" class="button" @click="stopPreparation">停止核对</button><button v-else class="button json-remove-confirm" :disabled="!proposal" @click="apply"><Trash2 :size="21" aria-hidden="true" />移除到草稿</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Trash2, Box, Layers, FileText } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import JsonOperationContext from './JsonOperationContext.vue'
import JsonSourcePreview from './JsonSourcePreview.vue'
import {boundedJsonPreview} from './jsonPreview'
import {jsonTypeName} from './jsonTree'
import { type JsonField, type JsonValuePatch } from './jsonStructure'
import { useJsonTask } from './useJsonTask'
const props = defineProps<{ content: string; identity: string; fields: JsonField[]; name: string; location: string; editing: boolean }>()
const emit = defineEmits<{ active: [value: boolean]; close: []; apply: [value: JsonValuePatch] }>()
const opened = ref(false), selected = ref(0), stopped = ref(false), proposal = shallowRef<JsonValuePatch>()
const heading = ref<HTMLElement>(), body = ref<HTMLElement>()
let active = true, scroll = 0
const current = computed(() => props.fields[selected.value])
const raw = computed(() => { const field = current.value; return field ? props.content.slice(field.keyFrom ?? field.from, field.to) : '' })
const truncated = computed(() => boundedJsonPreview(raw.value).truncated)
const preview = computed(() => boundedJsonPreview(raw.value).text)
const descendants = computed(() => { const pending = [...(current.value?.children || [])]; let count = 0; while (pending.length) { const field = props.fields[pending.pop()!]; if (field) { count++; pending.push(...field.children) } }; return count })
const { busy, error, run, stop } = useJsonTask(() => ({ content: props.content, identity: props.identity + '\nremove:' + selected.value }))
function invalidate() { stop(); error.value = ''; proposal.value = undefined; stopped.value = false }
function rememberScroll() { if (active && opened.value) scroll = body.value?.scrollTop || 0 }
async function focusHeading() { await nextTick(); if (!active || !opened.value) return; heading.value?.focus({ preventScroll: true }); if (body.value) body.value.scrollTop = scroll }
function prepare() {
  if (!active || !opened.value || !props.editing || !current.value || current.value.parent === null || busy.value) return
  invalidate()
  run({ id: selected.value, operation: { action: 'remove' } }, value => { if (active && opened.value && value.patch) proposal.value = value.patch })
}
async function open(id: number) { const field = props.fields[id]; if (!props.editing || !field || field.parent === null) return; invalidate(); selected.value = id; scroll = 0; active = true; opened.value = true; emit('active', true); prepare(); await focusHeading() }
function close() { invalidate(); opened.value = false; emit('active', false); emit('close') }
function stopPreparation() { stop(); proposal.value = undefined; stopped.value = true }
function apply() { if (!active || !opened.value || !props.editing || busy.value || !proposal.value || proposal.value.source !== props.content) return; emit('apply', proposal.value) }
function back() { if (!opened.value) return false; close(); return true }
function suspend() { rememberScroll(); if (busy.value) stopPreparation(); active = false }
function resume() { active = true; if (opened.value) void focusHeading() }
function reset() { invalidate(); opened.value = false; scroll = 0; emit('active', false) }
watch(() => [props.content, props.identity], reset, { flush: 'sync' })
watch(() => props.editing, value => { if (!value) reset() })
defineExpose({ open, back, suspend, resume })
</script>
