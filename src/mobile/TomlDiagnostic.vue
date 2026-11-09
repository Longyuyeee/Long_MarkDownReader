<template>
  <section class="toml-diagnostic structured-task" aria-label="TOML 语法检查">
    <header class="toml-diagnostic-header structured-header"><button class="toml-diagnostic-back structured-icon" :aria-label="fromStructure ? '返回结构树' : '返回操作菜单'" @click="close"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">检查 TOML</h1><MobileHelp topic="tomlDiagnostic" /></header>
    <div ref="body" class="toml-diagnostic-body structured-body">
      <div class="toml-diagnostic-context"><p class="toml-diagnostic-file">{{ name }}</p></div>
      <section class="toml-diagnostic-card structured-card structured-status-card" :class="{ 'toml-diagnostic-neutral-card': state === 'unavailable' }">
        <div class="toml-diagnostic-result structured-result" :class="state"><svg v-if="state === 'checking'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="state === 'valid' ? CircleCheck : state === 'unavailable' || state === 'stopped' || state === 'changed' ? CircleHelp : CircleAlert" :size="22" aria-hidden="true" /><h2 class="toml-diagnostic-result-title" role="status">{{ title }}</h2></div>
        <template v-if="hasPosition && result"><p class="toml-diagnostic-position structured-position">第 {{ result.line }} 行 · 第 {{ result.column }} 列附近</p><p v-if="message" class="toml-diagnostic-message toml-diagnostic-reason structured-diagnostic-message">{{ message }}</p><ol class="toml-diagnostic-excerpt structured-excerpt" aria-label="定位附近的源码"><li v-for="line in excerpt" :key="line.number" :class="{ current: line.current }"><span aria-hidden="true">{{ line.number }}</span><code role="group" tabindex="0" :aria-label="'第 ' + line.number + ' 行' + (line.current ? '，定位附近' : '')">{{ line.text || '（空行）' }}</code></li></ol></template>
        <p v-else-if="message&&state!=='valid'" class="toml-diagnostic-message structured-diagnostic-message" :role="state === 'failure' ? 'alert' : undefined">{{ message }}</p>
      </section>
      <button v-if="state==='invalid'" class="structured-secondary" @click="check">重新检查</button>
    </div>
    <footer class="toml-diagnostic-footer structured-footer"><button v-if="hasPosition" class="button primary-button" @click="locate">{{ state==='invalid'?'前往问题源码':'前往这段源码' }}</button><button v-else-if="state==='valid'||state==='unavailable'" class="button primary-button" @click="source">返回源码</button><button v-else-if="state==='checking'" class="button primary-button" @click="cancel">停止检查</button><button v-else class="button primary-button" @click="check">重新检查</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, CircleAlert, CircleCheck, CircleHelp } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { TOML_SOURCE_BUDGET } from './tomlBudget'
import type { TomlCheck } from './tomlSource'
import { sourceDiagnosticLines } from './sourceDiagnostic'
const props = defineProps<{ content: string; identity: string; name: string; fromStructure?: boolean }>()
const emit = defineEmits<{ close: []; source: []; locate: [value: { source: string; offset: number }]; diagnostic: [value: { source: string; offset?: number }] }>()
type State = 'checking' | 'invalid' | 'valid' | 'unavailable' | 'failure' | 'stopped' | 'changed'
const state = ref<State>('checking'), message = ref(''), result = shallowRef<TomlCheck>(), heading = ref<HTMLElement>(), body = ref<HTMLElement>()
const title = computed(() => ({ checking: '正在检查…', invalid: '未通过 TOML 1.0 检查', valid: 'TOML 1.0 检查通过', unavailable: '暂不检查', failure: '检查未完成', stopped: '检查已停止', changed: '需要重新检查' })[state.value])
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, checkedSource = '', checkedIdentity = ''
const offsetConfirmed = computed(() => !!result.value && Number.isInteger(result.value.offset) && result.value.offset! >= 0 && result.value.offset! <= checkedSource.length && Number.isInteger(result.value.line) && result.value.line! > 0 && Number.isInteger(result.value.column) && result.value.column! > 0)
const rangeSource = computed(() => state.value === 'unavailable' && result.value?.complete === false && /64 位检查范围|浮点数超出/.test(result.value.message))
const hasPosition = computed(() => offsetConfirmed.value && (state.value === 'invalid' || rangeSource.value))
const excerpt = computed(() => hasPosition.value ? sourceDiagnosticLines(checkedSource, result.value!.offset!, TOML_SOURCE_BUDGET.characters, true) : [])
function declineMessage(text: string) {
  if (/64 位检查范围/.test(text)) return '这个整数超出本轮有符号 64 位检查范围。'
  if (/浮点数超出/.test(text)) return '这个浮点数超出本轮检查范围。'
  if (/检查预算/.test(text)) return '这份 TOML 超过检查范围，请回到源码查找。'
  return text
}
function problemMessage(text: string) {
  const detail = /^未通过 TOML 1\.0 检查：(.*?)。可定位核对；/.exec(text)?.[1]
  const messages: Record<string, string> = {
    'Unterminated array': '数组尚未结束，请核对结束的 ]。',
    'Unterminated string': '文字引号尚未结束，请核对引号与换行。',
    'Unterminated inline table': '内联表尚未结束，请核对结束的 }。',
    'Defining a key multiple times is invalid': '这个名称被重复定义，请核对字段或表名称。',
    'Unspecified values are invalid': '这里缺少一个值，请核对值或结束位置。',
    'Control characters (codes < 0x1f and 0x7f) are not allowed': '这里有 TOML 不接受的控制字符，请回到源码核对。',
    'Trailing comma is not permitted in an inline table': 'TOML 1.0 的内联表不接受末尾逗号。'
  }
  return detail ? messages[detail] || detail : text
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined }
function source() { stop();emit('source') }
function close() { stop(); emit('close') }
function cancel() { stop(); result.value = undefined; state.value = 'stopped'; message.value = ''; emit('diagnostic', { source: props.content }); void nextTick(() => heading.value?.focus({ preventScroll: true })) }
function fail(text: string) { stop(); result.value = undefined; state.value = 'failure'; message.value = text }
function check() {
  stop(); result.value = undefined; message.value = ''; state.value = 'checking'; emit('diagnostic', { source: props.content }); if (body.value) body.value.scrollTop = 0
  const source = props.content, identity = props.identity, owner = generation
  checkedSource = source; checkedIdentity = identity
  if (source.length > TOML_SOURCE_BUDGET.characters) { state.value = 'unavailable'; message.value = '这份 TOML 较大，请回到源码查找。'; return }
  try {
    worker = new Worker(new URL('./toml.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (owner !== generation || source !== props.content || identity !== props.identity) return
      const value = event.data as TomlCheck; stop(); result.value = value
      if (value.complete && value.valid) state.value = 'valid'
      else if (!value.complete) { state.value = /暂时无法/.test(value.message) ? 'failure' : 'unavailable'; message.value = declineMessage(value.message) }
      else if (offsetConfirmed.value) { state.value = 'invalid'; message.value = problemMessage(value.message); emit('diagnostic', { source, offset: value.offset }) }
      else { state.value = 'failure'; message.value = '暂时无法完成检查，请重试。' }
    }
    worker.onerror = event => { event.preventDefault(); if (owner === generation) fail('暂时无法完成检查，请重试。') }
    timer = setTimeout(() => { if (owner === generation) fail('检查时间较长，已停止。') }, TOML_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source })
  } catch { fail('暂时无法完成检查，请重试。') }
}
function locate() { if (!hasPosition.value || result.value?.offset === undefined || checkedSource !== props.content || checkedIdentity !== props.identity) return; stop(); emit('locate', { source: checkedSource, offset: result.value.offset }) }
watch(() => [props.content, props.identity], () => { stop(); result.value = undefined; state.value = 'changed'; message.value = '正文已有变化，请重新检查。'; emit('diagnostic', { source: props.content }) }, { flush: 'sync' })
defineExpose({ stop })
onMounted(async () => { check(); await nextTick(); heading.value?.focus({ preventScroll: true }) }); onBeforeUnmount(stop)
</script>
