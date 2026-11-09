<template>
  <section class="json-format" aria-label="JSON 排版核对">
    <header class="json-format-header"><button class="json-format-back" aria-label="返回操作" @click="close"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">整理 JSON 缩进</h1><MobileHelp topic="jsonFormat" /></header>
    <div ref="body" class="json-format-body" @scroll="rememberScroll">
      <div class="json-format-context"><p class="json-format-file"><Folder :size="22" aria-hidden="true" />{{ name }}</p></div>
      <div v-if="state === 'ready'" role="group" aria-label="核对 JSON 排版">
        <div class="json-format-switch" role="group" aria-label="排版预览方式"><button :aria-pressed="view === 'after'" @click="show('after')">整理后</button><button :aria-pressed="view === 'before'" @click="show('before')">原文</button></div>
        <section class="json-format-preview"><JsonSourcePreview :value="preview.text" :numbered="!preview.truncated" :label="view === 'after' ? '整理后的 JSON' : '原始 JSON'" /></section>
        <p v-if="preview.truncated" class="json-format-message">预览已省略中间部分；应用使用完整内容。</p><button class="json-format-keep" @click="source">保持原文</button>
      </div>
      <section v-else class="json-format-card">
        <div class="json-format-result" :class="'json-format-' + state"><svg v-if="state === 'preparing'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="state === 'unchanged' ? CircleCheck : state === 'unavailable' || state === 'stopped' || state === 'changed' ? CircleHelp : CircleAlert" :size="24" aria-hidden="true" /><h2 class="json-format-result-title" role="status">{{ title }}</h2></div>
        <template v-if="state === 'invalid' && result"><p class="json-format-position">第 {{ result.line }} 行 · 第 {{ result.column }} 列附近</p><ol class="json-format-excerpt" aria-label="问题附近的源码"><li v-for="line in excerpt" :key="line.number" :class="{ current: line.current }"><span aria-hidden="true">{{ line.number }}</span><code role="group" tabindex="0" :aria-label="`第 ${line.number} 行${line.current ? '，问题附近' : ''}`">{{ line.text || '（空行）' }}</code></li></ol></template>
        <p v-if="message" class="json-format-message" :role="state === 'failure' ? 'alert' : undefined">{{ message }}</p>
      </section>
    </div>
    <footer class="json-format-footer">
      <button v-if="state === 'unchanged' || state === 'unavailable'" class="button primary-button" @click="source">返回源码</button>
      <template v-else><button v-if="state !== 'ready'" class="button" @click="source">保持原文</button><button v-if="state === 'ready'" class="button primary-button" @click="apply"><Check :size="21" aria-hidden="true" />应用到草稿</button><button v-else-if="state === 'invalid'" class="button primary-button" @click="locate">前往问题源码</button><button v-else-if="state === 'preparing'" class="button primary-button" @click="cancel">停止准备</button><button v-else class="button primary-button" @click="prepare">重新准备</button></template>
    </footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, CircleAlert, CircleCheck, CircleHelp, Folder, Check } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import JsonSourcePreview from './JsonSourcePreview.vue'
import { JSON_SOURCE_BUDGET, type JsonCheck } from './jsonSource'
import { jsonDiagnosticLines } from './jsonDiagnostic'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ close: []; source: []; apply: [value: { source: string; formatted: string }]; locate: [value: { source: string; offset: number }] }>()
type State = 'preparing' | 'ready' | 'invalid' | 'unchanged' | 'unavailable' | 'failure' | 'stopped' | 'changed'
type View = 'after' | 'before'
const state = ref<State>('preparing'), message = ref(''), result = shallowRef<JsonCheck>(), heading = ref<HTMLElement>(), body = ref<HTMLElement>(), view = ref<View>('after')
const title = computed(() => ({ preparing: '正在准备预览…', ready: '', invalid: '先修正语法问题', unchanged: '无需调整', unavailable: '暂不整理', failure: '预览未完成', stopped: '准备已停止', changed: '需要重新准备' })[state.value])
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, checkedSource = '', checkedIdentity = '', scrollOwner = 0, restoringScroll = false
const positions: Record<View, number> = { after: 0, before: 0 }
const excerpt = computed(() => result.value?.offset === undefined ? [] : jsonDiagnosticLines(checkedSource, result.value.offset))
const preview = computed(() => {
  const text = view.value === 'before' ? checkedSource : result.value?.formatted || ''
  if (text.length <= 1600) return { text, truncated: false }
  // Keep surrogate pairs intact when bounding the displayed preview, without copying the full document.
  const splitPair = (at: number) => text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff
  return { text: text.slice(0, splitPair(1200) ? 1199 : 1200) + '\n…\n' + text.slice(splitPair(text.length - 400) ? text.length - 399 : text.length - 400), truncated: true }
})
function rememberScroll() { if (!restoringScroll && body.value && state.value === 'ready') positions[view.value] = body.value.scrollTop }
async function show(next: View) {
  if (next === view.value) return
  rememberScroll(); restoringScroll = true; const owner = ++scrollOwner; view.value = next
  await nextTick(); if (body.value && owner === scrollOwner) body.value.scrollTop = positions[next]
  requestAnimationFrame(() => { if (owner === scrollOwner) restoringScroll = false })
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined }
function close() { stop(); emit('close') }
function source() { stop(); emit('source') }
function cancel() { stop(); result.value = undefined; state.value = 'stopped'; message.value = '' }
function fail(text: string) { stop(); result.value = undefined; state.value = 'failure'; message.value = text }
function prepare() {
  stop(); result.value = undefined; message.value = ''; state.value = 'preparing'; view.value = 'after'; positions.after = positions.before = 0; scrollOwner++; restoringScroll = false
  if (body.value) body.value.scrollTop = 0
  const source = props.content, identity = props.identity, owner = generation
  checkedSource = source; checkedIdentity = identity
  if (!props.editing) { close(); return }
  if (source.length > JSON_SOURCE_BUDGET.characters) { state.value = 'unavailable'; message.value = '这份 JSON 较大，暂不检查或整理；全文仍可阅读、查找、编辑和保存。'; return }
  try {
    worker = new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (owner !== generation || source !== props.content || identity !== props.identity || !props.editing) return
      const value = event.data as JsonCheck; stop(); result.value = value
      if (value.valid && value.formatted !== undefined) state.value = value.formatted === source ? 'unchanged' : 'ready'
      else if (!value.valid && Number.isInteger(value.offset) && value.line && value.column) state.value = 'invalid'
      else { state.value = /暂时无法/.test(value.message) ? 'failure' : 'unavailable'; message.value = value.message }
    }
    worker.onerror = event => { event.preventDefault(); if (owner === generation) fail('暂时无法准备排版，源文仍可继续使用。') }
    timer = setTimeout(() => { if (owner === generation) fail('准备时间较长，已停止；源文与草稿继续保留。') }, JSON_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source, format: true })
  } catch { fail('暂时无法准备排版，源文仍可继续使用。') }
}
function current() { return checkedSource === props.content && checkedIdentity === props.identity && props.editing }
function apply() { if (state.value !== 'ready' || result.value?.formatted === undefined || !current()) return; stop(); emit('apply', { source: checkedSource, formatted: result.value.formatted }) }
function locate() { if (state.value !== 'invalid' || result.value?.offset === undefined || !current()) return; stop(); emit('locate', { source: checkedSource, offset: result.value.offset }) }
watch(() => [props.content, props.identity], () => { stop(); result.value = undefined; state.value = 'changed'; message.value = '正文已有变化，请重新准备排版。' }, { flush: 'sync' })
watch(() => props.editing, editing => { if (!editing) close() }, { flush: 'sync' })
defineExpose({ stop })
onMounted(async () => { prepare(); await nextTick(); heading.value?.focus({ preventScroll: true }) }); onBeforeUnmount(() => { stop(); scrollOwner++ })
</script>
<style scoped>
.json-format { --json-format-error:#a13e32; display:flex; flex-direction:column; flex:1; min-height:0; }
.json-format-header { display:flex; flex:none; align-items:center; gap:8px; padding:7.5px 8px; min-height:64px; border-bottom:1px solid var(--line); }
.json-format-header :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.json-format-back { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; color:var(--muted); background:transparent; }
h1 { flex:1; min-width:0; margin:0; font-size:1.25rem; font-weight:700; line-height:1.5; letter-spacing:0; overflow-wrap:anywhere; }
.json-format-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:16px; }
.json-format-context { margin-bottom:16px; }
.json-format-file { margin:0; font-size:.8125rem; line-height:1.5384615385; color:var(--muted); }
.json-format-card { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.json-format-result { display:flex; align-items:center; gap:10px; color:var(--primary); }
.json-format-result > svg { flex:none; }
.json-format-invalid,.json-format-failure { color:var(--json-format-error); }
.json-format-unavailable,.json-format-stopped,.json-format-changed,.json-format-unchanged { color:var(--muted); }
.json-format-result-title { margin:0; font-size:1rem; line-height:1.5; font-weight:600; letter-spacing:0; overflow-wrap:anywhere; }
.json-format-position { margin:12px 0 16px; font-size:1.25rem; line-height:1.5; font-weight:700; letter-spacing:0; overflow-wrap:anywhere; }
.json-format-excerpt { list-style:none; margin:0; padding:8px; border-radius:8px; background:var(--panel); }
.json-format-excerpt li { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:12px; padding:6px 8px; border-left:2px solid transparent; }
.json-format-excerpt li.current { border-left-color:var(--json-format-error); background:var(--bg); }
.json-format-excerpt span { font:.75rem/1.75 Consolas,monospace; color:var(--muted); min-width:2ch; }
.json-format-excerpt code { font:.875rem/1.5 Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; max-height:24dvh; overflow:auto; }
.json-format-message { margin:12px 0 0; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.json-format-footer { flex:none; display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.button { flex:1 1 10em; min-height:48px; padding:11px 14px; border-radius:10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
:global(.theme-dark .json-format) { --json-format-error:#ffb4a8; }
@media(max-height:250px) { .json-format-header { min-height:49px; padding:0 8px; } }
.json-format-switch { display:flex; gap:8px; position:sticky; top:-16px; padding:0 0 12px; background:var(--bg); z-index:1; }
.json-format-switch button { flex:1; min-height:48px; border:1px solid var(--line); border-radius:10px; background:var(--surface); padding:11px 14px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
.json-format-switch button[aria-pressed=true] { border-color:var(--primary); background:var(--panel); color:var(--primary); }
.json-format-preview { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }


.json-format-body{display:flex;flex-direction:column}
.json-format-body>[role=group]{flex:1 0 auto;min-height:0;display:flex;flex-direction:column}
.json-format-switch{flex:none}
.json-format-keep{flex:none;display:block;min-height:48px;margin:24px 0 0;padding:8px 12px;width:100%;border:0;background:transparent;color:var(--ink);font:inherit;font-size:1rem}
.json-format-body>[role=group]>.json-format-keep{margin-top:auto;padding-top:20px}
.json-format-preview{flex:none}
.json-format{background:var(--bg);color:var(--ink)}
.json-format-header h1{font-size:1.125rem}
.json-format-context{padding-bottom:16px;border-bottom:1px solid var(--line);margin-bottom:16px}
.json-format-file{display:flex;align-items:flex-start;gap:12px;font-size:1rem;line-height:1.5;color:var(--primary);overflow-wrap:anywhere}
.json-format-file svg{flex:none;margin-top:1px}
.json-format-switch{gap:0;padding:0;border-radius:10px;background:var(--panel);overflow:hidden;margin-bottom:16px;top:0}
.json-format-switch button{border:0;border-radius:10px;background:transparent;font-size:1rem;font-weight:600}
.json-format-switch button[aria-pressed=true]{background:var(--primary);color:var(--bg)}
.json-format-preview{padding:0;background:var(--surface);border-radius:10px;overflow:hidden}
.json-format-footer{flex-direction:column;gap:8px;max-height:45dvh}
.json-format-footer .button{flex:none;width:100%;font-size:1rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px}
.json-format-footer>.button:not(.primary-button){border:0;background:transparent}
.json-format-card{border:0;background:transparent;padding:32px 0}
.json-format-result{flex-direction:column;gap:16px}
.json-format-result-title{font-size:1.25rem;color:var(--ink)}
.json-format-excerpt{margin-top:20px;border:1px solid var(--line);background:var(--surface)}
@media(max-height:400px){.json-format-footer{flex-direction:row}.json-format-footer .button{flex:1;width:auto;font-size:.875rem}.json-format-card{padding-top:16px}}
</style>
