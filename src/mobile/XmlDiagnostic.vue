<template>
  <section class="xml-diagnostic structured-task" aria-label="XML 语法检查">
    <header class="xml-diagnostic-header structured-header"><button class="xml-diagnostic-back structured-icon" aria-label="返回操作菜单" @click="close"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">检查 XML</h1><MobileHelp topic="xmlDiagnostic" /></header>
    <div ref="body" class="xml-diagnostic-body structured-body">
      <div class="xml-diagnostic-context"><p class="xml-diagnostic-file">{{ name }}</p></div>
      <section class="xml-diagnostic-card structured-card structured-status-card" :class="{ 'xml-diagnostic-neutral-card': state === 'unavailable' }">
        <div class="xml-diagnostic-result structured-result" :class="state"><svg v-if="state === 'checking'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="state === 'valid' ? CircleCheck : state === 'unavailable' || state === 'stopped' || state === 'changed' ? CircleHelp : CircleAlert" :size="22" aria-hidden="true" /><h2 class="xml-diagnostic-result-title" role="status">{{ title }}</h2></div>
        <template v-if="hasPosition && result"><p class="xml-diagnostic-position structured-position">第 {{ result.line }} 行 · 第 {{ result.column }} 列附近</p><p v-if="message" class="xml-diagnostic-message xml-diagnostic-reason structured-diagnostic-message">{{ message }}</p><ol class="xml-diagnostic-excerpt structured-excerpt" aria-label="定位附近的源码"><li v-for="line in excerpt" :key="line.number" :class="{ current: line.current }"><span aria-hidden="true">{{ line.number }}</span><code role="group" tabindex="0" :aria-label="'第 ' + line.number + ' 行' + (line.current ? '，定位附近' : '')">{{ line.text || '（空行）' }}</code></li></ol></template>
        <p v-else-if="message&&state!=='valid'" class="xml-diagnostic-message structured-diagnostic-message" :role="state === 'failure' ? 'alert' : undefined">{{ message }}</p>
      </section>
      <button v-if="state==='invalid'" class="structured-secondary" @click="check">重新检查</button>
    </div>
    <footer class="xml-diagnostic-footer structured-footer"><button v-if="hasPosition" class="button primary-button" @click="locate">{{ state==='invalid'?'前往问题源码':'前往这段源码' }}</button><button v-else-if="state==='valid'||state==='unavailable'" class="button primary-button" @click="source">返回源码</button><button v-else-if="state==='checking'" class="button primary-button" @click="cancel">停止检查</button><button v-else class="button primary-button" @click="check">重新检查</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, CircleAlert, CircleCheck, CircleHelp } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { XML_SOURCE_BUDGET } from './xmlBudget'
import type { XmlCheck } from './xmlSource'
import { sourceDiagnosticLines } from './sourceDiagnostic'
const props = defineProps<{ content: string; identity: string; name: string }>()
const emit = defineEmits<{ close: []; source: []; locate: [value: { source: string; offset: number }] }>()
type State = 'checking' | 'invalid' | 'valid' | 'unavailable' | 'failure' | 'stopped' | 'changed'
const state = ref<State>('checking'), message = ref(''), result = shallowRef<XmlCheck>(), heading = ref<HTMLElement>(), body = ref<HTMLElement>()
const title = computed(() => ({ checking: '正在检查…', invalid: '发现语法问题', valid: '语法检查通过', unavailable: '暂不检查', failure: '检查未完成', stopped: '检查已停止', changed: '需要重新检查' })[state.value])
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, checkedSource = '', checkedIdentity = ''
const offsetConfirmed = computed(() => !!result.value && Number.isInteger(result.value.offset) && result.value.offset! >= 0 && result.value.offset! <= checkedSource.length && Number.isInteger(result.value.line) && result.value.line! > 0 && Number.isInteger(result.value.column) && result.value.column! > 0)
const declaredSource = computed(() => state.value === 'unavailable' && result.value?.complete === false && /DOCTYPE|此版本|其他编码/.test(result.value.message))
const hasPosition = computed(() => offsetConfirmed.value && (state.value === 'invalid' || declaredSource.value))
const excerpt = computed(() => hasPosition.value ? sourceDiagnosticLines(checkedSource, result.value!.offset!, XML_SOURCE_BUDGET.characters, true) : [])
function declineMessage(text: string) {
  if (/DOCTYPE/.test(text)) return '含有 DOCTYPE，暂不解析 DTD 或自定义实体。'
  if (/此版本/.test(text)) return '当前检查 XML 1.0，这份文稿使用其他版本。'
  if (/其他编码/.test(text)) return '文件声明了其他编码，请先核对；保存仍使用 UTF-8。'
  return text
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined }
function source() { stop();emit('source') }
function close() { stop(); emit('close') }
function cancel() { stop(); result.value = undefined; state.value = 'stopped'; message.value = ''; void nextTick(() => heading.value?.focus({ preventScroll: true })) }
function fail(text: string) { stop(); result.value = undefined; state.value = 'failure'; message.value = text }
function check() {
  stop(); result.value = undefined; message.value = ''; state.value = 'checking'; if (body.value) body.value.scrollTop = 0
  const source = props.content, identity = props.identity, owner = generation
  checkedSource = source; checkedIdentity = identity
  if (source.length > XML_SOURCE_BUDGET.characters) { state.value = 'unavailable'; message.value = '这份 XML 较大，暂不检查；全文仍可阅读、查找、编辑和保存。'; return }
  try {
    worker = new Worker(new URL('./xml.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (owner !== generation || source !== props.content || identity !== props.identity) return
      const value = event.data as XmlCheck; stop(); result.value = value
      if (value.complete && value.valid) state.value = 'valid'
      else if (!value.complete) { state.value = /暂时无法/.test(value.message) ? 'failure' : 'unavailable'; message.value = declineMessage(value.message) }
      else if (offsetConfirmed.value) { state.value = 'invalid'; message.value = value.message === 'XML 在这段源码附近有语法问题，请核对标签、引号和结束位置。' ? '请核对标签、引号和结束位置。' : value.message }
      else { state.value = 'failure'; message.value = '暂时无法完成检查，源文仍可继续使用。' }
    }
    worker.onerror = event => { event.preventDefault(); if (owner === generation) fail('暂时无法完成检查，源文仍可继续使用。') }
    timer = setTimeout(() => { if (owner === generation) fail('检查时间较长，已停止；源文与草稿继续保留。') }, XML_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source })
  } catch { fail('暂时无法完成检查，源文仍可继续使用。') }
}
function locate() { if (!hasPosition.value || result.value?.offset === undefined || checkedSource !== props.content || checkedIdentity !== props.identity) return; stop(); emit('locate', { source: checkedSource, offset: result.value.offset }) }
watch(() => [props.content, props.identity], () => { stop(); result.value = undefined; state.value = 'changed'; message.value = '正文已有变化，请重新检查。' }, { flush: 'sync' })
defineExpose({ stop })
onMounted(async () => { check(); await nextTick(); heading.value?.focus({ preventScroll: true }) }); onBeforeUnmount(stop)
</script>
