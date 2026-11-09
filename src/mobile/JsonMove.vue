<template>
  <section v-if="opened" class="json-move json-operation-task" aria-label="JSON 移动数组项">
    <header class="json-move-header json-operation-header"><button class="json-move-back json-operation-icon" aria-label="返回结构操作" @click="back"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">移动数组项</h1><MobileHelp topic="jsonMove" /></header>
    <div ref="body" class="json-move-body json-operation-body" @scroll="rememberScroll">
      <JsonOperationContext class="json-move-context" :name="name" :location="location" label="移动项原位置" />
      <p class="json-move-summary json-operation-summary"><component :is="direction === -1 ? ArrowUp : ArrowDown" :size="22" aria-hidden="true" />第 {{ index + 1 }} 项 → 第 {{ index + direction + 1 }} 项</p>
      <h2 class="json-operation-section-title">移动后的相邻两项</h2><ol class="json-move-order json-operation-order" aria-label="移动后的相邻两项"><li v-for="item in order" :key="item.field.id" class="json-move-card json-operation-card" :class="{ 'json-move-selected': item.selected,'json-operation-candidate':item.selected }"><h2 class="assistive-status">位置 [{{ item.position }}] · {{ jsonKindLabel(item.field.kind) }}</h2><span class="json-move-position" aria-hidden="true">[{{ item.position }}]</span><div class="json-move-value"><JsonSourcePreview :value="preview(item.field)" :numbered="false" :label="item.selected ? '本次移动项的内容' : '相邻项的内容'" /></div><span v-if="item.selected" class="json-move-selected-label">本次移动</span><p v-if="raw(item.field).length > 1600" class="json-move-truncated json-operation-truncated">仅展示部分；整项内容一起移动。</p></li></ol>
      <p v-if="busy" role="status">正在核对移动结果…</p><p v-if="stopped" role="status">核对已停止。</p><p v-if="unchanged" class="json-move-unchanged" role="status">相邻两项内容相同，顺序无需改变。</p><p v-if="error" class="json-move-error json-operation-error" role="alert">{{ error }}</p>
      <button v-if="!busy && !proposal" class="button json-move-retry" @click="prepare">重新核对</button>
    <button class="json-operation-secondary" @click="close">取消移动</button></div>
    <footer class="json-move-footer json-operation-footer"><button v-if="busy" class="button" @click="stopPreparation">停止核对</button><button v-else class="button primary-button" :disabled="!proposal || unchanged" @click="apply"><Check :size="21" aria-hidden="true" />应用到草稿</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, ArrowUp, ArrowDown, Check } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import JsonOperationContext from './JsonOperationContext.vue'
import JsonSourcePreview from './JsonSourcePreview.vue'
import {boundedJsonPreview} from './jsonPreview'
import { jsonKindLabel, type JsonField, type JsonValuePatch } from './jsonStructure'
import { useJsonTask } from './useJsonTask'
const props = defineProps<{ content: string; identity: string; fields: JsonField[]; name: string; location: string; editing: boolean }>()
const emit = defineEmits<{ active: [value: boolean]; close: [direction: -1 | 1]; apply: [value: JsonValuePatch] }>()
const opened = ref(false), selected = ref(0), direction = ref<-1 | 1>(-1), stopped = ref(false), proposal = shallowRef<JsonValuePatch>()
const heading = ref<HTMLElement>(), body = ref<HTMLElement>()
let active = true, scroll = 0
const current = computed(() => props.fields[selected.value]), parent = computed(() => current.value?.parent === null || current.value?.parent === undefined ? undefined : props.fields[current.value.parent])
const index = computed(() => parent.value?.children.indexOf(selected.value) ?? -1)
const order = computed(() => {
  if (!current.value || parent.value?.kind !== 'array' || index.value < 0) return []
  const other = props.fields[parent.value.children[index.value + direction.value]!]
  if (!other) return []
  const first = Math.min(index.value, index.value + direction.value)
  return direction.value === -1 ? [{ field: current.value, position: first, selected: true }, { field: other, position: first + 1, selected: false }] : [{ field: other, position: first, selected: false }, { field: current.value, position: first + 1, selected: true }]
})
const raw = (field: JsonField) => props.content.slice(field.from, field.to)
const preview = (field:JsonField)=>boundedJsonPreview(raw(field)).text
const unchanged = computed(() => !!proposal.value && proposal.value.text === props.content.slice(proposal.value.from, proposal.value.to))
const { busy, error, run, stop } = useJsonTask(() => ({ content: props.content, identity: props.identity + '\nmove:' + selected.value + ':' + direction.value }))
function invalidate() { stop(); error.value = ''; proposal.value = undefined; stopped.value = false }
function rememberScroll() { if (active && opened.value) scroll = body.value?.scrollTop || 0 }
async function focusHeading() { await nextTick(); if (!active || !opened.value) return; heading.value?.focus({ preventScroll: true }); if (body.value) body.value.scrollTop = scroll }
function prepare() { if (!active || !opened.value || !props.editing || order.value.length !== 2 || busy.value) return; invalidate(); run({ id: selected.value, operation: { action: 'move', direction: direction.value } }, value => { if (active && opened.value && value.patch) proposal.value = value.patch }) }
async function open(id: number, step: -1 | 1) { const field = props.fields[id], owner = field?.parent === null || field?.parent === undefined ? undefined : props.fields[field.parent]; if (!props.editing || !field || owner?.kind !== 'array' || ![-1, 1].includes(step)) return; const place = owner.children.indexOf(id); if (place < 0 || owner.children[place + step] === undefined) return; invalidate(); selected.value = id; direction.value = step; scroll = 0; active = true; opened.value = true; emit('active', true); prepare(); await focusHeading() }
function close() { invalidate(); opened.value = false; emit('active', false); emit('close', direction.value) }
function stopPreparation() { stop(); proposal.value = undefined; stopped.value = true }
function apply() { if (!active || !opened.value || !props.editing || busy.value || !proposal.value || unchanged.value || proposal.value.source !== props.content) return; emit('apply', proposal.value) }
function back() { if (!opened.value) return false; close(); return true }
function suspend() { rememberScroll(); if (busy.value) stopPreparation(); active = false }
function resume() { active = true; if (opened.value) void focusHeading() }
function reset() { invalidate(); opened.value = false; scroll = 0; emit('active', false) }
watch(() => [props.content, props.identity], reset, { flush: 'sync' })
watch(() => props.editing, value => { if (!value) reset() })
defineExpose({ open, back, suspend, resume })
</script>
