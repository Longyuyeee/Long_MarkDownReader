<template>
  <div v-if="open" class="pdf-page-layer" :inert="mobileHelpOpen || undefined" @click.self="emit('close')">
    <section ref="dialog" class="pdf-page-dialog" role="dialog" aria-modal="true" aria-label="PDF 页码定位" @keydown="keydown">
      <header class="pdf-page-dialog-header"><h2>前往页码</h2><MobileHelp topic="pdfPage" /><button type="button" class="pdf-page-dialog-close" aria-label="关闭页码定位" @click="emit('close')"><X :size="22" aria-hidden="true" /></button></header>
      <div ref="body" class="pdf-page-dialog-body">
        <div class="pdf-page-dialog-context"><p class="pdf-page-dialog-file">{{ name }}</p><p class="pdf-page-dialog-current">当前第 {{ page }} 页</p></div>
        <form id="pdf-page-form" @submit.prevent="submit"><label for="pdf-page-number">前往第几页（共 {{ pages }} 页）</label><input id="pdf-page-number" ref="input" v-model="value" inputmode="numeric" maxlength="6" autocomplete="off" :aria-invalid="!!error" :aria-describedby="error ? 'pdf-page-dialog-error' : undefined" @input="edited" @select="remember" @blur="remember" @scroll.passive="remember" /><p v-if="error" id="pdf-page-dialog-error" class="pdf-page-dialog-error" role="alert">{{ error }}</p></form>
      </div>
      <footer class="pdf-page-dialog-footer"><button type="button" class="button" @click="emit('close')">返回阅读</button><button type="submit" form="pdf-page-form" class="button primary-button">前往这一页</button></footer>
    </section>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { mobileHelpOpen } from './mobileHelp'
import { focusableControls } from './accessibility'
import { pdfPageNumber } from './pdfDocument'
const props = defineProps<{ open: boolean; name: string; page: number; pages: number }>()
const emit = defineEmits<{ close: []; goto: [page: number] }>()
const value = ref(''), error = ref(''), input = ref<HTMLInputElement>(), body = ref<HTMLElement>(), dialog = ref<HTMLElement>()
let pending = false, epoch = 0, position = { start: 0, end: 0, direction: 'none' as 'none' | 'forward' | 'backward', left: 0, top: 0 }
let resize: ResizeObserver | undefined
watch(body, host => {
  resize?.disconnect()
  if (!host) return
  let width = host.clientWidth, height = host.clientHeight
  resize = new ResizeObserver(() => {
    const changed = width !== host.clientWidth || height !== host.clientHeight
    width = host.clientWidth; height = host.clientHeight
    if (changed && props.open && input.value === document.activeElement) reveal(input.value)
  })
  resize.observe(host)
})
onBeforeUnmount(() => { epoch++; resize?.disconnect() })
function readInput() {
  const live = input.value
  if (live && live.value !== value.value) { value.value = live.value; pending = true; error.value = '' }
}
function remember() {
  const live = input.value
  if (!live) return
  readInput()
  position = { start: live.selectionStart ?? 0, end: live.selectionEnd ?? 0, direction: live.selectionDirection ?? 'none', left: live.scrollLeft, top: body.value?.scrollTop ?? 0 }
}
function edited() { pending = true; error.value = ''; remember() }
watch(() => props.open, async open => {
  const owner = ++epoch
  if (!open) { remember(); return }
  if (!pending) { value.value = String(props.page); error.value = ''; position = { start: 0, end: value.value.length, direction: 'none', left: 0, top: 0 } }
  await nextTick()
  if (owner !== epoch || !props.open) return
  input.value?.focus({ preventScroll: true })
  input.value?.setSelectionRange(position.start, position.end, position.direction)
  if (input.value) input.value.scrollLeft = position.left
  if (body.value) body.value.scrollTop = position.top
}, { immediate: true })
async function submit() {
  remember()
  try { const page = pdfPageNumber(value.value, props.pages); pending = false; error.value = ''; emit('goto', page) }
  catch (reason) {
    error.value = reason instanceof Error ? reason.message : '请输入有效页码。'; pending = true
    await nextTick(); input.value?.focus({ preventScroll: true }); reveal(input.value)
    const message = body.value?.querySelector<HTMLElement>('.pdf-page-dialog-error')
    if (message && body.value && body.value.clientHeight >= message.offsetHeight + (input.value?.offsetHeight ?? 0) + 12) reveal(message)
  }
}
function reveal(element: HTMLElement | undefined) {
  const host = body.value
  if (!host || !element) return
  const box = element.getBoundingClientRect(), bounds = host.getBoundingClientRect()
  if (box.top < bounds.top) host.scrollTop += box.top - bounds.top
  else if (box.bottom > bounds.bottom) host.scrollTop += box.bottom - bounds.bottom
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (event.key !== 'Tab') return
  event.preventDefault()
  const controls = focusableControls(dialog.value), index = controls.indexOf(document.activeElement as HTMLElement)
  controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length]?.focus()
}
</script>
<style scoped>
.pdf-page-layer { position:absolute; z-index:20; inset:0; display:grid; place-items:center; padding:16px; background:#14261d66; }
.pdf-page-dialog { --page-error:#a13e32; width:min(100%,400px); max-height:100%; display:flex; flex-direction:column; min-height:0; background:var(--bg); color:var(--ink); border:1px solid var(--line); border-radius:16px; box-shadow:0 12px 40px #14261d26; overflow:hidden; }
:global(.theme-dark .pdf-page-dialog) { --page-error:#f09d8f; }
.pdf-page-dialog-header { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px 7.5px 16px; border-bottom:1px solid var(--line); }
.pdf-page-dialog-header h2 { flex:1; min-width:0; margin:0; font-size:1.25rem; line-height:1.5; font-weight:700; letter-spacing:0; overflow-wrap:anywhere; }
.pdf-page-dialog-header :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.pdf-page-dialog-close { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; border:0; padding:0; color:var(--muted); background:transparent; }
.pdf-page-dialog-body { padding:16px; overflow:auto; min-height:0; overscroll-behavior:contain; }
.pdf-page-dialog-context { margin-bottom:16px; }
.pdf-page-dialog-file { margin:0 0 4px; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; overflow-wrap:anywhere; }
.pdf-page-dialog-current { margin:0; color:var(--muted); font-size:.875rem; line-height:1.5; }
.pdf-page-dialog label { display:block; margin:0 0 8px; font-size:.875rem; line-height:1.5; }
.pdf-page-dialog input { display:block; width:100%; min-height:48px; padding:11px 12px; font:inherit; font-size:1rem; line-height:1.5; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px; }
.pdf-page-dialog input[aria-invalid=true] { border-color:var(--page-error); }
.pdf-page-dialog-error { margin:12px 0 0; font-size:.875rem; line-height:1.5; color:var(--page-error); overflow-wrap:anywhere; }
.pdf-page-dialog-footer { flex:none; display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.pdf-page-dialog-footer .button { flex:1; min-width:0; min-height:48px; padding:11px 14px; font-size:.875rem; line-height:1.7142857143; font-weight:400; border-radius:10px; }
.pdf-page-dialog :deep(button) { -webkit-tap-highlight-color:transparent; }
.pdf-page-dialog :deep(button:active) { filter:brightness(.95); }
@media(max-width:340px) { .pdf-page-dialog-header h2 { font-size:1.125rem; } .pdf-page-dialog-footer { flex-direction:column; } .pdf-page-dialog-footer .button { flex:none; } }
@media(max-height:500px) { .pdf-page-layer { padding:8px; } .pdf-page-dialog-header { min-height:56px; padding:3.5px 8px 3.5px 12px; } .pdf-page-dialog-header h2 { font-size:1rem; } .pdf-page-dialog-context { display:none; } .pdf-page-dialog-body { padding:12px 16px; } .pdf-page-dialog-footer { flex-direction:row; padding:8px 12px; } .pdf-page-dialog-footer .button { flex:1; padding:8px 6px; font-size:.75rem; line-height:1.5; } .pdf-page-dialog-error { margin-top:8px; } }
</style>
