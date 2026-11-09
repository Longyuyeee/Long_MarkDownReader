<template>
  <section ref="panel" class="yaml-diagnostic structured-task" aria-label="YAML 语法检查">
    <header class="yaml-diagnostic-header structured-header"><button class="yaml-diagnostic-back structured-icon" :aria-label="diagnostic ? '返回检查结果' : '返回操作菜单'" @click="headerBack"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">{{ diagnostic ? diagnostic.severity === 'warning' ? '提示详情' : '问题详情' : '检查 YAML' }}</h1><MobileHelp topic="yamlDiagnostic" /></header>
    <div ref="body" class="yaml-diagnostic-body structured-body">
      <div class="yaml-diagnostic-context"><p class="yaml-diagnostic-file">{{ name }}</p></div>
      <section class="yaml-diagnostic-card structured-card structured-status-card" :class="{ 'yaml-diagnostic-warning-card': diagnostic?.severity === 'warning' }">
        <div class="yaml-diagnostic-result structured-result" :class="displayState"><svg v-if="state === 'checking'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 1 1-7.07 2.93" /></svg><component v-else :is="displayState === 'valid' ? CircleCheck : displayState === 'unavailable' || displayState === 'stopped' || displayState === 'changed' ? CircleHelp : CircleAlert" :size="22" aria-hidden="true" /><h2 class="yaml-diagnostic-result-title" role="status">{{ diagnostic ? diagnosticTitle(diagnostic) : title }}</h2></div>
        <template v-if="diagnostic">
          <p class="yaml-diagnostic-position structured-position">第 {{ diagnostic.line }} 行 · 第 {{ diagnostic.column }} 列附近</p>
          <p class="yaml-diagnostic-message yaml-diagnostic-reason structured-diagnostic-message">{{ diagnostic.message }}</p>
          <ol class="yaml-diagnostic-excerpt structured-excerpt" aria-label="结果附近的源码"><li v-for="line in excerpt" :key="line.number" :class="{ current: line.current }"><span aria-hidden="true">{{ line.number }}</span><code role="group" tabindex="0" :aria-label="'第 ' + line.number + ' 行' + (line.current ? '，定位附近' : '')">{{ line.text || '（空行）' }}</code></li></ol>
          <p v-if="!canLocate" class="yaml-diagnostic-notice structured-notice">无法确认这条结果的位置，请返回源码核对。</p>
        </template>
        <p v-else-if="issues.length" class="yaml-diagnostic-count structured-diagnostic-message">{{ countText }}</p>
        <p v-else-if="message&&state!=='valid'" class="yaml-diagnostic-message structured-diagnostic-message" :role="state === 'failure' ? 'alert' : undefined">{{ message }}</p>
        <p v-else-if="state === 'valid' && result && result.documents !== 1" class="yaml-diagnostic-count structured-diagnostic-message">{{ result.documents ? '共 ' + result.documents + ' 份文档' : '当前没有 YAML 文档。' }}</p>
      </section>
      <template v-if="!diagnostic && issues.length">
        <ul class="yaml-diagnostic-issues" aria-label="YAML 检查结果"><li v-for="(item, index) in issues" :key="index"><button class="yaml-diagnostic-issue" :data-diagnostic-index="index" @click="openIssue(index)"><strong>{{ item.severity === 'error' ? '问题' : '提示' }} · 第 {{ item.line }} 行，第 {{ item.column }} 列</strong><span>{{ diagnosticTitle(item) }}</span></button></li></ul>
        <p v-if="result?.truncated" class="yaml-diagnostic-notice structured-notice" role="status">结果未全部列出，请修正后重新检查。</p>
      </template>
      <button v-if="diagnostic" class="structured-secondary" @click="returnResults">返回检查结果</button>
    </div>
    <footer class="yaml-diagnostic-footer structured-footer"><button v-if="diagnostic&&canLocate" class="button primary-button" @click="locate">{{ diagnostic.severity==='warning'?'前往提示源码':'前往问题源码' }}</button><button v-else-if="diagnostic||state==='valid'||state==='unavailable'" class="button primary-button" @click="source">返回源码</button><button v-else-if="state==='checking'" class="button primary-button" @click="cancel">停止检查</button><button v-else class="button primary-button" @click="check">重新检查</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, CircleAlert, CircleCheck, CircleHelp } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { YAML_SOURCE_BUDGET, type YamlCheck, type YamlDiagnostic } from './yamlSource'
import { sourceDiagnosticLines } from './sourceDiagnostic'
const props = defineProps<{ content: string; identity: string; name: string }>()
const emit = defineEmits<{ close: []; source: []; locate: [value: { source: string; offset: number }] }>()
type State = 'checking' | 'invalid' | 'warning' | 'valid' | 'unavailable' | 'failure' | 'stopped' | 'changed'
const state = ref<State>('checking'), message = ref(''), result = shallowRef<YamlCheck>(), selected = ref<number | null>(null), heading = ref<HTMLElement>(), body = ref<HTMLElement>(), panel = ref<HTMLElement>()
const title = computed(() => ({ checking: '正在检查…', invalid: '发现语法问题', warning: '有提示需要核对', valid: '语法检查通过', unavailable: '暂不检查', failure: '检查未完成', stopped: '检查已停止', changed: '需要重新检查' })[state.value])
const issues = computed(() => result.value?.complete && (state.value === 'invalid' || state.value === 'warning') ? [...result.value.diagnostics].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1) || a.offset - b.offset) : [])
const diagnostic = computed(() => selected.value === null ? undefined : issues.value[selected.value])
const displayState = computed(() => diagnostic.value ? diagnostic.value.severity === 'warning' ? 'warning' : 'invalid' : state.value)
const countText = computed(() => {
  const errors = issues.value.filter(item => item.severity === 'error').length, warnings = issues.value.length - errors
  return (result.value?.truncated ? '已列出 ' : '') + [errors ? errors + ' 个问题' : '', warnings ? warnings + ' 条提示' : ''].filter(Boolean).join(' · ')
})
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, checkedSource = '', checkedIdentity = '', rootScroll = 0
const canLocate = computed(() => !!diagnostic.value && Number.isInteger(diagnostic.value.offset) && diagnostic.value.offset >= 0 && diagnostic.value.offset <= checkedSource.length)
const excerpt = computed(() => diagnostic.value ? sourceDiagnosticLines(checkedSource, diagnostic.value.offset, YAML_SOURCE_BUDGET.characters) : [])
function diagnosticTitle(item: YamlDiagnostic) {
  if (item.code === 'TAG_RESOLVE_FAILED') return item.severity === 'warning' ? '标签需要核对' : '标签格式或值需修正'
  const titles: Record<string, string> = { DUPLICATE_KEY: '字段名重复', UNRESOLVED_ALIAS: '别名引用未定义', TAB_AS_INDENT: '缩进中使用了 Tab', BAD_INDENT: '缩进或集合格式有误', MISSING_CHAR: '缺少必要的分隔符', UNEXPECTED_TOKEN: '出现了意外的符号', BAD_ALIAS: '别名格式有误' }
  return titles[item.code] || (item.severity === 'warning' ? '需要核对的提示' : '语法或结构有误')
}
function stop() { generation++; clearTimeout(timer); worker?.terminate(); worker = undefined }
function source() { stop();emit('source') }
function close() { stop(); emit('close') }
function cancel() { stop(); result.value = undefined; selected.value = null; state.value = 'stopped'; message.value = '' }
function fail(text: string) { stop(); result.value = undefined; selected.value = null; state.value = 'failure'; message.value = text }
function check() {
  stop(); result.value = undefined; selected.value = null; message.value = ''; state.value = 'checking'; rootScroll = 0; if (body.value) body.value.scrollTop = 0
  const source = props.content, identity = props.identity, owner = generation
  checkedSource = source; checkedIdentity = identity
  if (source.length > YAML_SOURCE_BUDGET.characters) { state.value = 'unavailable'; message.value = '这份 YAML 较大，暂不检查；全文仍可阅读、查找、编辑和保存。'; return }
  try {
    worker = new Worker(new URL('./yaml.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = event => {
      if (owner !== generation || source !== props.content || identity !== props.identity) return
      const value = event.data as YamlCheck; stop(); result.value = value
      if (!value.complete) { state.value = /暂时无法/.test(value.message) ? 'failure' : 'unavailable'; message.value = value.message }
      else if (!value.valid || value.diagnostics.some(item => item.severity === 'error')) state.value = 'invalid'
      else state.value = value.diagnostics.length ? 'warning' : 'valid'
    }
    worker.onerror = event => { event.preventDefault(); if (owner === generation) fail('暂时无法完成检查，源文仍可继续使用。') }
    timer = setTimeout(() => { if (owner === generation) fail('检查时间较长，已停止；源文与草稿继续保留。') }, YAML_SOURCE_BUDGET.milliseconds)
    worker.postMessage({ content: source })
  } catch { fail('暂时无法完成检查，源文仍可继续使用。') }
}
async function openIssue(index: number) { if (!issues.value[index]) return; rootScroll = body.value?.scrollTop || 0; selected.value = index; await nextTick(); if (body.value) body.value.scrollTop = 0; heading.value?.focus({ preventScroll: true }) }
async function returnResults() { const index = selected.value; selected.value = null; await nextTick(); if (body.value) body.value.scrollTop = rootScroll; const target = panel.value?.querySelector<HTMLElement>('[data-diagnostic-index="' + index + '"]'); (target || heading.value)?.focus({ preventScroll: true }) }
function back() { if (selected.value === null) return false; void returnResults(); return true }
function headerBack() { if (!back()) close() }
function locate() { if (!canLocate.value || !diagnostic.value || checkedSource !== props.content || checkedIdentity !== props.identity) return; stop(); emit('locate', { source: checkedSource, offset: diagnostic.value.offset }) }
watch(() => [props.content, props.identity], () => { stop(); result.value = undefined; selected.value = null; state.value = 'changed'; message.value = '正文已有变化，请重新检查。' }, { flush: 'sync' })
defineExpose({ stop, back })
onMounted(async () => { check(); await nextTick(); heading.value?.focus({ preventScroll: true }) }); onBeforeUnmount(stop)
</script>
