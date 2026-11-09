<template>
  <section class="json-diagnostic" aria-label="JSON 语法检查">
    <header class="json-diagnostic-header"><button class="json-diagnostic-back" aria-label="返回操作" @click="close"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">检查 JSON</h1><MobileHelp topic="jsonDiagnostic" /></header>
    <div class="json-diagnostic-body">
      <div class="json-diagnostic-context"><p class="json-diagnostic-file"><Folder :size="22" aria-hidden="true" />{{ name }}</p></div>
      <section class="json-diagnostic-card" :class="{'result-valid':state==='valid'}">
        <div class="json-diagnostic-result" :class="'json-diagnostic-' + state"><svg v-if="state === 'checking'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="state === 'valid' ? Check : state === 'unavailable' || state === 'stopped' || state === 'changed' ? CircleHelp : CircleAlert" :size="24" aria-hidden="true" /><h2 class="json-diagnostic-result-title" role="status">{{ title }}</h2></div>
        <template v-if="state === 'invalid' && result"><p class="json-diagnostic-position">第 {{ result.line }} 行 · 第 {{ result.column }} 列附近</p><ol class="json-diagnostic-excerpt" aria-label="问题附近的源码"><li v-for="line in excerpt" :key="line.number" :class="{ current: line.current }"><span aria-hidden="true">{{ line.number }}</span><code role="group" tabindex="0" :aria-label="`第 ${line.number} 行${line.current ? '，问题附近' : ''}`">{{ line.text || '（空行）' }}</code></li></ol></template>
        <p v-if="message" class="json-diagnostic-message" :role="state === 'failure' ? 'alert' : undefined">{{ message }}</p>
      </section>
    </div>
    <footer class="json-diagnostic-footer">
      <template v-if="state === 'invalid'"><button class="button primary-button" @click="locate">前往问题源码</button><button class="json-recheck" aria-label="重新检查" @click="check"><RefreshCw :size="22" aria-hidden="true" /></button></template>
      <button v-else-if="state === 'valid' || state === 'unavailable'" class="button primary-button" @click="source">返回源码</button>
      <template v-else><button class="button" @click="source">返回源码</button><button v-if="state === 'checking'" class="button primary-button" @click="cancel">停止检查</button><button v-else class="button primary-button" @click="check">重新检查</button></template>
    </footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, CircleAlert, Check, CircleHelp, Folder, RefreshCw } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { JSON_SOURCE_BUDGET, type JsonCheck } from './jsonSource'
import { jsonDiagnosticLines } from './jsonDiagnostic'
const props = defineProps<{ content: string; identity: string; name: string }>()
const emit = defineEmits<{ close: []; source: []; locate: [value: { source: string; offset: number }] }>()
type State = 'checking' | 'invalid' | 'valid' | 'unavailable' | 'failure' | 'stopped' | 'changed'
const state = ref<State>('checking'), message = ref(''), result = shallowRef<JsonCheck>(), heading = ref<HTMLElement>()
const title = computed(() => ({ checking: '正在检查…', invalid: '发现语法问题', valid: '语法检查通过', unavailable: '暂不检查', failure: '检查未完成', stopped: '检查已停止', changed: '需要重新检查' })[state.value])
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, checkedSource = '', checkedIdentity = ''
const excerpt = computed(() => result.value?.offset === undefined ? [] : jsonDiagnosticLines(checkedSource, result.value.offset))
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined }
function close() { stop(); emit('close') }
function source() { stop(); emit('source') }
function cancel() { stop(); result.value = undefined; state.value = 'stopped'; message.value = '' }
function fail(text: string) { stop(); result.value = undefined; state.value = 'failure'; message.value = text }
function check() {
  stop(); result.value = undefined; message.value = ''; state.value = 'checking'
  const source = props.content, identity = props.identity, owner = generation
  checkedSource = source; checkedIdentity = identity
  if (source.length > JSON_SOURCE_BUDGET.characters) { state.value = 'unavailable'; message.value = '这份 JSON 较大，暂不检查或整理；全文仍可阅读、查找、编辑和保存。'; return }
  try {
    worker = new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (owner !== generation || source !== props.content || identity !== props.identity) return
      const value = event.data as JsonCheck; stop(); result.value = value
      if (value.valid) state.value = 'valid'
      else if (Number.isInteger(value.offset) && value.line && value.column) state.value = 'invalid'
      else { state.value = /暂时无法/.test(value.message) ? 'failure' : 'unavailable'; message.value = value.message }
    }
    worker.onerror = event => { event.preventDefault(); if (owner === generation) fail('暂时无法完成检查，源文仍可继续使用。') }
    timer = setTimeout(() => { if (owner === generation) fail('检查时间较长，已停止；源文与草稿继续保留。') }, JSON_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source, format: false })
  } catch { fail('暂时无法完成检查，源文仍可继续使用。') }
}
function locate() { if (state.value !== 'invalid' || result.value?.offset === undefined || checkedSource !== props.content || checkedIdentity !== props.identity) return; stop(); emit('locate', { source: checkedSource, offset: result.value.offset }) }
watch(() => [props.content, props.identity], () => { stop(); result.value = undefined; state.value = 'changed'; message.value = '正文已有变化，请重新检查。' }, { flush: 'sync' })
defineExpose({ stop })
onMounted(async () => { check(); await nextTick(); heading.value?.focus({ preventScroll: true }) }); onBeforeUnmount(stop)
</script>
<style scoped>
.json-diagnostic { --json-diagnostic-error:#a13e32; display:flex; flex-direction:column; flex:1; min-height:0; }
.json-diagnostic-header { display:flex; flex:none; align-items:center; gap:8px; padding:7.5px 8px; min-height:64px; border-bottom:1px solid var(--line); }
.json-diagnostic-header :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.json-diagnostic-back { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; color:var(--muted); background:transparent; }
h1 { flex:1; min-width:0; margin:0; font-size:1.25rem; font-weight:700; line-height:1.5; letter-spacing:0; overflow-wrap:anywhere; }
.json-diagnostic-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:16px; }
.json-diagnostic-context { margin-bottom:16px; }
.json-diagnostic-file { margin:0; font-size:.8125rem; line-height:1.5384615385; color:var(--muted); }
.json-diagnostic-card { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.json-diagnostic-result { display:flex; align-items:center; gap:10px; color:var(--primary); }
.json-diagnostic-result > svg { flex:none; }
.json-diagnostic-invalid,.json-diagnostic-failure { color:var(--json-diagnostic-error); }
.json-diagnostic-unavailable,.json-diagnostic-stopped,.json-diagnostic-changed { color:var(--muted); }
.json-diagnostic-result-title { margin:0; font-size:1rem; line-height:1.5; font-weight:600; letter-spacing:0; overflow-wrap:anywhere; }
.json-diagnostic-position { margin:12px 0 16px; font-size:1.25rem; line-height:1.5; font-weight:700; letter-spacing:0; overflow-wrap:anywhere; }
.json-diagnostic-excerpt { list-style:none; margin:0; padding:8px; border-radius:8px; background:var(--panel); }
.json-diagnostic-excerpt li { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:12px; padding:6px 8px; border-left:2px solid transparent; }
.json-diagnostic-excerpt li.current { border-left-color:var(--json-diagnostic-error); background:var(--bg); }
.json-diagnostic-excerpt span { font:.75rem/1.75 Consolas,monospace; color:var(--muted); min-width:2ch; }
.json-diagnostic-excerpt code { font:.875rem/1.5 Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; max-height:24dvh; overflow:auto; }
.json-diagnostic-message { margin:12px 0 0; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.json-diagnostic-footer { flex:none; display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.button { flex:1 1 10em; min-height:48px; padding:11px 14px; border-radius:10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
:global(.theme-dark .json-diagnostic) { --json-diagnostic-error:#ffb4a8; }
@media(max-height:250px) { .json-diagnostic-header { min-height:49px; padding:0 8px; } }

.json-diagnostic{background:var(--bg);color:var(--ink)}
.json-diagnostic-header h1{font-size:1.125rem}
.json-diagnostic-context{padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:0}
.json-diagnostic-file{display:flex;align-items:flex-start;gap:12px;font-size:1rem;line-height:1.5;color:var(--primary);overflow-wrap:anywhere}
.json-diagnostic-file svg{flex:none;margin-top:1px}
.json-diagnostic-card{border:0;padding:40px 0 16px;background:transparent;text-align:center}
.json-diagnostic-result{flex-direction:column;gap:20px}
.json-diagnostic-result>svg{width:64px;height:64px;padding:18px;border-radius:50%;background:var(--primary-soft)}
.json-diagnostic-result-title{font-size:1.25rem;font-weight:700;color:var(--ink)}
.json-diagnostic-invalid>svg,.json-diagnostic-failure>svg{background:var(--json-diagnostic-error-bg,#ffeded)}
.json-diagnostic-position{display:inline-block;border-radius:20px;padding:6px 14px;margin:16px 0 24px;background:var(--panel);font-size:.875rem;font-weight:600}
.json-diagnostic-excerpt{text-align:left;padding:12px 0;border:1px solid var(--line);background:var(--surface)}
.json-diagnostic-excerpt li{padding:4px 12px;border-left-width:3px}
.json-diagnostic-excerpt li.current{background:var(--json-diagnostic-error-bg,#ffeded)}
.json-diagnostic-excerpt code{font:.875rem/1.8 ui-monospace,Consolas,monospace}
.json-diagnostic-card.result-valid{padding-top:88px}
.json-diagnostic-card.result-valid .json-diagnostic-result>svg{width:80px;height:80px;padding:20px}
.json-diagnostic-message{text-align:left}
.json-diagnostic-footer .button{font-size:1rem;border-radius:10px;font-weight:600}
.json-recheck{display:grid;place-items:center;flex:0 0 48px;min-height:48px;min-width:48px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)}
:global(.theme-dark .json-diagnostic){--json-diagnostic-error-bg:#452e31}
@media(max-height:400px){.json-diagnostic-card,.json-diagnostic-card.result-valid{padding-top:24px}}
</style>
